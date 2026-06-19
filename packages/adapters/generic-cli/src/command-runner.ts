import { randomUUID } from "node:crypto";
import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
  type StdioOptions,
} from "node:child_process";

import type { AgentEventInput, AgentSource } from "@agentpulse/core";

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
  spawnError?: string;
  status: "completed" | "failed";
}

async function emitSafely(
  sink: EventSink,
  event: AgentEventInput,
  onError?: RunCommandOptions["onEmitError"],
): Promise<void> {
  try {
    await sink(event);
  } catch (error) {
    onError?.(error, event);
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
      const spawnOptions: SpawnOptions = {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: options.stdio ?? "inherit",
      };
      child = spawn(options.command, args, spawnOptions);
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
