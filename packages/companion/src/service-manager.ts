import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { NotifierKind } from "@crewlight/notifier";

import type { CrewlightCliContext } from "./runtime.js";

const OUTPUT_LINE_LIMIT = 8;
const OUTPUT_TEXT_LIMIT = 180;
const STOP_TIMEOUT_MS = 5_000;

export type ManagedServicePhase =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface ManagedServiceSettings {
  host: string;
  port: number;
  notifier: NotifierKind;
}

export interface ManagedServiceState {
  phase: ManagedServicePhase;
  host: string;
  port: number;
  notifier: NotifierKind;
  managed: boolean;
  pid?: number;
  exitCode?: number;
  signal?: NodeJS.Signals;
  lastError?: string;
  stdoutSummary: string[];
  stderrSummary: string[];
}

export interface DaemonServiceManager {
  dispose(): Promise<void>;
  restart(settings: ManagedServiceSettings): Promise<boolean>;
  snapshot(): ManagedServiceState;
  start(settings: ManagedServiceSettings): Promise<boolean>;
  stop(): Promise<boolean>;
  subscribe(listener: (state: ManagedServiceState) => void): () => void;
}

function sanitizeOutputLine(line: string): string | undefined {
  const normalized = line.trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, OUTPUT_TEXT_LIMIT);
}

function createLineCollector(target: string[]): (chunk: string) => void {
  let carry = "";
  return (chunk) => {
    carry += chunk;
    const lines = carry.split(/\r?\n/u);
    carry = lines.pop() ?? "";
    for (const line of lines) {
      const safe = sanitizeOutputLine(line);
      if (!safe) {
        continue;
      }
      target.push(safe);
      if (target.length > OUTPUT_LINE_LIMIT) {
        target.shift();
      }
    }
  };
}

export function createDaemonServiceManager(
  cli: CrewlightCliContext,
  defaults: ManagedServiceSettings,
): DaemonServiceManager {
  const events = new EventEmitter();
  let child: ChildProcessWithoutNullStreams | undefined;
  let stopTimer: NodeJS.Timeout | undefined;
  let expectedStop = false;
  let currentSettings = { ...defaults };
  let state: ManagedServiceState = {
    phase: "stopped",
    host: defaults.host,
    port: defaults.port,
    notifier: defaults.notifier,
    managed: false,
    stdoutSummary: [],
    stderrSummary: [],
  };

  function publish(): void {
    events.emit("state", { ...state });
  }

  function applyState(
    update: Partial<ManagedServiceState>,
    options: { resetOutput?: boolean } = {},
  ): void {
    state = {
      ...state,
      ...update,
      ...(options.resetOutput ? { stdoutSummary: [], stderrSummary: [] } : {}),
    };
    publish();
  }

  function clearStopTimer(): void {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = undefined;
    }
  }

  function releaseChild(): void {
    clearStopTimer();
    if (child) {
      child.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child = undefined;
    }
  }

  async function stop(): Promise<boolean> {
    if (!child) {
      applyState({
        phase: "stopped",
        managed: false,
        pid: undefined,
      });
      return true;
    }

    expectedStop = true;
    applyState({
      phase: "stopping",
      managed: true,
    });
    const activeChild = child;
    return await new Promise<boolean>((resolve) => {
      const finish = (result: boolean) => {
        activeChild.removeListener("exit", onExit);
        clearStopTimer();
        resolve(result);
      };
      const onExit = () => {
        finish(true);
      };
      activeChild.once("exit", onExit);
      try {
        activeChild.kill("SIGTERM");
      } catch {
        finish(false);
        return;
      }
      stopTimer = setTimeout(() => {
        try {
          activeChild.kill("SIGKILL");
        } catch {
          // Ignore a late kill failure; the exit handler will settle state.
        }
      }, STOP_TIMEOUT_MS);
    });
  }

  async function start(settings: ManagedServiceSettings): Promise<boolean> {
    currentSettings = { ...settings };
    if (child) {
      return true;
    }

    expectedStop = false;
    applyState(
      {
        phase: "starting",
        managed: true,
        host: settings.host,
        port: settings.port,
        notifier: settings.notifier,
        exitCode: undefined,
        signal: undefined,
        lastError: undefined,
        pid: undefined,
      },
      { resetOutput: true },
    );

    const args = [
      ...cli.args,
      "daemon",
      "--dashboard",
      "--host",
      settings.host,
      "--port",
      String(settings.port),
      "--notifier",
      settings.notifier,
    ];

    try {
      child = spawn(cli.command, args, {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      applyState({
        phase: "error",
        managed: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    const spawnedChild = child;
    if (!spawnedChild) {
      applyState({
        phase: "error",
        managed: false,
        lastError: "The local Crewlight service process did not start.",
      });
      return false;
    }

    const stdoutCollector = createLineCollector(state.stdoutSummary);
    const stderrCollector = createLineCollector(state.stderrSummary);

    spawnedChild.stdout.setEncoding("utf8");
    spawnedChild.stderr.setEncoding("utf8");
    spawnedChild.stdout.on("data", (chunk: string) => {
      stdoutCollector(chunk);
      publish();
    });
    spawnedChild.stderr.on("data", (chunk: string) => {
      stderrCollector(chunk);
      publish();
    });
    spawnedChild.on("spawn", () => {
      applyState({
        phase: "running",
        managed: true,
        pid: spawnedChild.pid,
      });
    });
    spawnedChild.on("error", (error) => {
      applyState({
        phase: "error",
        managed: false,
        pid: undefined,
        lastError: error.message,
      });
      releaseChild();
    });
    spawnedChild.on("exit", (code, signal) => {
      const unexpected = !expectedStop;
      applyState({
        phase: unexpected ? "error" : "stopped",
        managed: false,
        pid: undefined,
        exitCode: code ?? undefined,
        signal: signal ?? undefined,
        ...(unexpected
          ? {
              lastError:
                code === 0 || code === null
                  ? "The local Crewlight service exited unexpectedly."
                  : `The local Crewlight service exited with code ${code}.`,
            }
          : {}),
      });
      expectedStop = false;
      releaseChild();
    });
    return true;
  }

  return {
    dispose: async () => {
      expectedStop = true;
      await stop();
      releaseChild();
    },
    restart: async (settings) => {
      currentSettings = { ...settings };
      const stopped = await stop();
      if (!stopped) {
        return false;
      }
      return await start(currentSettings);
    },
    snapshot: () => ({ ...state }),
    start,
    stop,
    subscribe: (listener) => {
      events.on("state", listener);
      listener({ ...state });
      return () => {
        events.off("state", listener);
      };
    },
  };
}
