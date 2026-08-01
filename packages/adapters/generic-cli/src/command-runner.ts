import { randomUUID } from "node:crypto";
import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
  type StdioOptions,
} from "node:child_process";
import { statSync } from "node:fs";
import { extname, win32 } from "node:path";

import type { AgentEventInput, AgentSource } from "@crewlight/core";

import {
  createCommandEvent,
  createCompletedMessage,
  createFailedMessage,
  createRunningMessage,
  formatCommand,
  type CommandEventContext,
} from "./command-events.js";

export type EventSink = (event: AgentEventInput) => Promise<void> | void;

export interface RunCommandOptions {
  command: string;
  args?: readonly string[];
  cwd?: string;
  emit: EventSink;
  env?: NodeJS.ProcessEnv;
  onEmitError?: (error: unknown, event: AgentEventInput) => void;
  source?: AgentSource;
  stdio?: StdioOptions;
}

export interface CommandRunResult {
  durationMs: number;
  exitCode: number | null;
  sessionId: string;
  signal: NodeJS.Signals | null;
  startFailure?: "unsafe-windows-batch-argument";
  spawnError?: string;
  status: "completed" | "failed";
}

export interface CommandInvocation {
  args: string[];
  command: string;
  windowsVerbatimArguments?: boolean;
}

export type WindowsCommandLocator = (
  command: string,
  env: NodeJS.ProcessEnv,
  cwd?: string,
) => string | undefined;

const WINDOWS_CMD_META_CHARACTERS = /([()\][%!^"`<>&|;, *?])/gu;
const WINDOWS_UNSAFE_BATCH_ARGUMENT = /[\0\r\n"%!^&|<>()]/u;
const WINDOWS_UNSAFE_BATCH_MESSAGE =
  "Windows batch command arguments cannot contain shell metacharacters or line breaks. Invoke cmd.exe explicitly if shell syntax is intentional.";

class UnsafeWindowsBatchArgumentError extends Error {
  constructor() {
    super(WINDOWS_UNSAFE_BATCH_MESSAGE);
    this.name = "UnsafeWindowsBatchArgumentError";
  }
}

function resolveWindowsSystemExecutable(name: string): string {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  return win32.join(systemRoot, "System32", name);
}

function windowsEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  return (
    env[name] ??
    Object.entries(env).find(
      ([key, value]) =>
        value !== undefined && key.toLowerCase() === name.toLowerCase(),
    )?.[1]
  );
}

function locateWindowsCommand(
  command: string,
  env: NodeJS.ProcessEnv,
  cwd?: string,
): string | undefined {
  if (win32.basename(command) === command) {
    const extensions = extname(command)
      ? [""]
      : (windowsEnvironmentValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((extension) => extension.trim())
          .filter(Boolean);
    const pathDirectories = (windowsEnvironmentValue(env, "PATH") ?? "")
      .split(";")
      .map((directory) => directory.trim())
      .map((directory) =>
        directory.startsWith('"') && directory.endsWith('"')
          ? directory.slice(1, -1)
          : directory,
      )
      .filter(Boolean);
    const searchDirectories = [cwd ?? process.cwd(), ...pathDirectories];
    const visited = new Set<string>();
    for (const directory of searchDirectories) {
      const absoluteDirectory = win32.isAbsolute(directory)
        ? directory
        : win32.resolve(cwd ?? process.cwd(), directory);
      const identity = absoluteDirectory.toLowerCase();
      if (visited.has(identity)) {
        continue;
      }
      visited.add(identity);
      for (const extension of extensions) {
        const candidate = win32.join(
          absoluteDirectory,
          `${command}${extension}`,
        );
        try {
          if (statSync(candidate).isFile()) {
            return candidate;
          }
        } catch {
          // Continue with the remaining search directories and extensions.
        }
      }
    }
  }

  // Resolve the helper from the parent runtime, not the wrapped command's
  // caller-supplied environment or working directory.
  const result = spawnSync(
    resolveWindowsSystemExecutable("where.exe"),
    [command],
    {
      cwd,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    },
  );
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return undefined;
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
}

function escapeWindowsCmdCommand(value: string): string {
  return value.replace(WINDOWS_CMD_META_CHARACTERS, "^$1");
}

function escapeWindowsCmdArgument(
  value: string,
  doubleEscapeMetaCharacters: boolean,
): string {
  let escaped = value
    .replace(/(\\*)"/gu, '$1$1\\"')
    .replace(/(\\*)$/gu, "$1$1");
  escaped = `"${escaped}"`.replace(WINDOWS_CMD_META_CHARACTERS, "^$1");
  return doubleEscapeMetaCharacters
    ? escaped.replace(WINDOWS_CMD_META_CHARACTERS, "^$1")
    : escaped;
}

export function resolveWindowsCommandInvocation(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  locator: WindowsCommandLocator = locateWindowsCommand,
  cwd?: string,
): CommandInvocation {
  const resolvedCommand = locator(command, env, cwd) ?? command;
  const extension = extname(resolvedCommand).toLowerCase();
  if (extension !== ".cmd" && extension !== ".bat") {
    return { command: resolvedCommand, args: [...args] };
  }

  if (args.some((argument) => WINDOWS_UNSAFE_BATCH_ARGUMENT.test(argument))) {
    throw new UnsafeWindowsBatchArgumentError();
  }
  const commandLine = [
    escapeWindowsCmdCommand(resolvedCommand),
    ...args.map((argument) =>
      // Batch files add another cmd.exe parsing layer. Always double-escape
      // metacharacters so argument data cannot become a second command.
      escapeWindowsCmdArgument(argument, true),
    ),
  ].join(" ");
  return {
    command: resolveWindowsSystemExecutable("cmd.exe"),
    args: ["/d", "/s", "/v:off", "/c", `"${commandLine}"`],
    windowsVerbatimArguments: true,
  };
}

async function emitSafely(
  sink: EventSink,
  event: AgentEventInput,
  onError?: RunCommandOptions["onEmitError"],
): Promise<void> {
  try {
    await sink(event);
  } catch (error) {
    try {
      onError?.(error, event);
    } catch {
      // Event reporting must never interrupt or strand the wrapped command.
    }
  }
}

export async function runCommand(
  options: RunCommandOptions,
): Promise<CommandRunResult> {
  if (!options.command) {
    throw new Error("Command cannot be empty");
  }

  const args = [...(options.args ?? [])];
  const startedAt = Date.now();
  const context: CommandEventContext = {
    commandText: formatCommand(options.command, args),
    projectPath: options.cwd ?? process.cwd(),
    sessionId: `generic-cli:${randomUUID()}`,
    source: options.source ?? "generic-cli",
    startedAt,
  };

  return new Promise<CommandRunResult>((resolve) => {
    let child: ChildProcess;
    let finished = false;
    let runningEmission = Promise.resolve();

    const duration = () => Math.max(0, Date.now() - startedAt);
    const emitFailure = async (details: {
      exitCode?: number;
      signal?: NodeJS.Signals;
      spawnError?: string;
    }) => {
      const durationMs = duration();
      const event = createCommandEvent(
        context,
        "failed",
        createFailedMessage(context, { ...details, durationMs }),
        Date.now(),
      );
      await emitSafely(options.emit, event, options.onEmitError);
      return durationMs;
    };

    try {
      const invocation =
        process.platform === "win32"
          ? resolveWindowsCommandInvocation(
              options.command,
              args,
              options.env,
              locateWindowsCommand,
              options.cwd,
            )
          : { command: options.command, args };
      const spawnOptions: SpawnOptions = {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: options.stdio ?? "inherit",
        ...(invocation.windowsVerbatimArguments
          ? { windowsVerbatimArguments: true }
          : {}),
      };
      child = spawn(invocation.command, invocation.args, spawnOptions);
    } catch (error) {
      finished = true;
      void (async () => {
        const spawnError =
          error instanceof Error ? error.message : String(error);
        const durationMs = await emitFailure({ spawnError });
        resolve({
          durationMs,
          exitCode: null,
          sessionId: context.sessionId,
          signal: null,
          ...(error instanceof UnsafeWindowsBatchArgumentError
            ? { startFailure: "unsafe-windows-batch-argument" as const }
            : {}),
          spawnError,
          status: "failed",
        });
      })();
      return;
    }

    child.once("spawn", () => {
      const event = createCommandEvent(
        context,
        "running",
        createRunningMessage(context),
        Date.now(),
      );
      runningEmission = emitSafely(options.emit, event, options.onEmitError);
    });

    child.once("error", (error) => {
      if (finished) {
        return;
      }
      finished = true;

      void (async () => {
        const durationMs = await emitFailure({ spawnError: error.message });
        resolve({
          durationMs,
          exitCode: null,
          sessionId: context.sessionId,
          signal: null,
          spawnError: error.message,
          status: "failed",
        });
      })();
    });

    child.once("close", (exitCode, signal) => {
      if (finished) {
        return;
      }
      finished = true;

      void (async () => {
        await runningEmission;
        const durationMs = duration();

        if (exitCode === 0) {
          const event = createCommandEvent(
            context,
            "completed",
            createCompletedMessage(context, durationMs),
            Date.now(),
          );
          await emitSafely(options.emit, event, options.onEmitError);
          resolve({
            durationMs,
            exitCode,
            sessionId: context.sessionId,
            signal,
            status: "completed",
          });
          return;
        }

        const failedDurationMs = await emitFailure({
          ...(exitCode === null ? {} : { exitCode }),
          ...(signal === null ? {} : { signal }),
        });
        resolve({
          durationMs: failedDurationMs,
          exitCode,
          sessionId: context.sessionId,
          signal,
          status: "failed",
        });
      })();
    });
  });
}
