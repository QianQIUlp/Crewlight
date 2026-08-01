import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { NotifierKind } from "@crewlight/notifier";
import { DAEMON_READY_OUTPUT_PREFIX } from "@crewlight/shared";

import type { CrewlightCliContext } from "./runtime.js";

const OUTPUT_LINE_LIMIT = 8;
const OUTPUT_TEXT_LIMIT = 180;
export const DAEMON_START_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 5_000;
const FORCE_STOP_GRACE_MS = 1_000;

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
  let startPromise: Promise<boolean> | undefined;
  let settlePendingStart: ((result: boolean) => void) | undefined;
  let stopTimer: NodeJS.Timeout | undefined;
  let stopPromise: Promise<boolean> | undefined;
  let settlePendingStop: ((result: boolean) => void) | undefined;
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

  function requestManagedShutdown(
    activeChild: ChildProcessWithoutNullStreams,
  ): boolean {
    try {
      if (!activeChild.stdin.writable || activeChild.stdin.destroyed) {
        return false;
      }
      activeChild.stdin.write("shutdown\n", "utf8");
      return true;
    } catch {
      return false;
    }
  }

  function releaseChild(): void {
    clearStopTimer();
    if (child) {
      child.removeAllListeners();
      child.stdin.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child = undefined;
    }
  }

  function terminateTimedOutChild(
    activeChild: ChildProcessWithoutNullStreams,
    timeoutMessage: string,
  ): void {
    const finishUnconfirmedStop = (): void => {
      if (child !== activeChild) {
        return;
      }
      clearStopTimer();
      applyState({
        phase: "error",
        managed: true,
        pid: activeChild.pid,
        lastError: `${timeoutMessage} The process did not confirm exit after a forced stop.`,
      });
    };
    const forceStop = (): void => {
      if (child !== activeChild) {
        return;
      }
      try {
        if (!activeChild.kill("SIGKILL")) {
          finishUnconfirmedStop();
          return;
        }
      } catch {
        finishUnconfirmedStop();
        return;
      }
      stopTimer = setTimeout(finishUnconfirmedStop, FORCE_STOP_GRACE_MS);
    };

    clearStopTimer();
    if (!requestManagedShutdown(activeChild)) {
      forceStop();
      return;
    }
    if (child === activeChild) {
      stopTimer = setTimeout(forceStop, STOP_TIMEOUT_MS);
    }
  }

  async function stop(): Promise<boolean> {
    if (stopPromise) {
      return await stopPromise;
    }
    if (!child) {
      applyState({
        phase: "stopped",
        managed: false,
        pid: undefined,
      });
      return true;
    }

    expectedStop = true;
    settlePendingStart?.(false);
    clearStopTimer();
    applyState({
      phase: "stopping",
      managed: true,
    });
    const activeChild = child;
    const operation = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        if (settlePendingStop === finish) {
          settlePendingStop = undefined;
        }
        activeChild.removeListener("exit", onExit);
        clearStopTimer();
        resolve(result);
      };
      const failStop = () => {
        if (child === activeChild) {
          applyState({
            phase: "error",
            managed: true,
            lastError:
              "The managed local service did not exit after a forced stop.",
          });
        }
        finish(false);
      };
      const forceStop = () => {
        try {
          if (!activeChild.kill("SIGKILL")) {
            failStop();
            return;
          }
        } catch {
          failStop();
          return;
        }
        stopTimer = setTimeout(failStop, FORCE_STOP_GRACE_MS);
      };
      const onExit = () => {
        finish(true);
      };
      settlePendingStop = finish;
      activeChild.once("exit", onExit);
      if (!requestManagedShutdown(activeChild)) {
        forceStop();
        return;
      }
      stopTimer = setTimeout(forceStop, STOP_TIMEOUT_MS);
    });
    stopPromise = operation;
    try {
      return await operation;
    } finally {
      if (stopPromise === operation) {
        stopPromise = undefined;
      }
    }
  }

  function start(settings: ManagedServiceSettings): Promise<boolean> {
    currentSettings = { ...settings };
    if (startPromise) {
      return startPromise;
    }
    if (child) {
      return Promise.resolve(state.phase === "running");
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
      "--managed-stdio",
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
        windowsHide: true,
      });
    } catch (error) {
      applyState({
        phase: "error",
        managed: false,
        lastError: error instanceof Error ? error.message : String(error),
      });
      return Promise.resolve(false);
    }

    const spawnedChild = child;
    if (!spawnedChild) {
      applyState({
        phase: "error",
        managed: false,
        lastError: "The local Crewlight service process did not start.",
      });
      return Promise.resolve(false);
    }

    const stdoutCollector = createLineCollector(state.stdoutSummary);
    const stderrCollector = createLineCollector(state.stderrSummary);
    let readyProbe = "";
    let startupSettled = false;
    let startupFailureMessage: string | undefined;
    let startTimer: NodeJS.Timeout | undefined;
    let resolveStart: ((result: boolean) => void) | undefined;
    const operation = new Promise<boolean>((resolve) => {
      resolveStart = resolve;
    });
    const settleStart = (result: boolean): void => {
      if (startupSettled) {
        return;
      }
      startupSettled = true;
      if (startTimer) {
        clearTimeout(startTimer);
        startTimer = undefined;
      }
      if (settlePendingStart === settleStart) {
        settlePendingStart = undefined;
      }
      resolveStart?.(result);
    };
    settlePendingStart = settleStart;
    const markReady = (): void => {
      if (startupSettled || child !== spawnedChild) {
        return;
      }
      applyState({
        phase: "running",
        managed: true,
        pid: spawnedChild.pid,
      });
      settleStart(true);
    };

    spawnedChild.stdout.setEncoding("utf8");
    spawnedChild.stderr.setEncoding("utf8");
    spawnedChild.stdin.on("error", () => {
      // A daemon may close its managed control pipe before the ChildProcess
      // exit event arrives. The bounded stop timer still confirms or forces
      // termination, so EPIPE must not become an uncaught Electron error.
    });
    spawnedChild.stdout.on("data", (chunk: string) => {
      stdoutCollector(chunk);
      const probeOutput = `${readyProbe}${chunk}`;
      if (probeOutput.includes(DAEMON_READY_OUTPUT_PREFIX)) {
        markReady();
      }
      readyProbe = probeOutput.slice(
        -(DAEMON_READY_OUTPUT_PREFIX.length + OUTPUT_TEXT_LIMIT),
      );
      publish();
    });
    spawnedChild.stderr.on("data", (chunk: string) => {
      stderrCollector(chunk);
      publish();
    });
    spawnedChild.on("spawn", () => {
      if (child === spawnedChild && !startupSettled) {
        applyState({
          phase: "starting",
          managed: true,
          pid: spawnedChild.pid,
        });
      }
    });
    spawnedChild.on("error", (error) => {
      if (child !== spawnedChild) {
        return;
      }
      const stopping = settlePendingStop !== undefined;
      applyState({
        phase: "error",
        managed: stopping,
        pid: stopping ? spawnedChild.pid : undefined,
        lastError: startupFailureMessage ?? error.message,
      });
      settleStart(false);
      if (stopping) {
        // A ChildProcess error does not guarantee that the OS process exited.
        // Keep the handle and the bounded TERM/KILL timers until exit is
        // observed or stop() reports an unconfirmed forced stop.
        return;
      }
      releaseChild();
    });
    spawnedChild.on("exit", (code, signal) => {
      if (child !== spawnedChild) {
        return;
      }
      const unexpected = !expectedStop;
      applyState({
        phase: startupFailureMessage
          ? "error"
          : unexpected
            ? "error"
            : "stopped",
        managed: false,
        pid: undefined,
        exitCode: code ?? undefined,
        signal: signal ?? undefined,
        ...(startupFailureMessage
          ? { lastError: startupFailureMessage }
          : unexpected
            ? {
                lastError:
                  code === 0 || code === null
                    ? "The local Crewlight service exited unexpectedly."
                    : `The local Crewlight service exited with code ${code}.`,
              }
            : { lastError: undefined }),
      });
      settleStart(false);
      settlePendingStop?.(true);
      expectedStop = false;
      releaseChild();
    });
    startTimer = setTimeout(() => {
      if (startupSettled || child !== spawnedChild) {
        return;
      }
      startupFailureMessage = `The local Crewlight service did not report readiness within ${DAEMON_START_TIMEOUT_MS}ms.`;
      applyState({
        phase: "error",
        managed: true,
        pid: spawnedChild.pid,
        lastError: startupFailureMessage,
      });
      settleStart(false);
      terminateTimedOutChild(spawnedChild, startupFailureMessage);
    }, DAEMON_START_TIMEOUT_MS);

    startPromise = operation;
    void operation.then(() => {
      if (startPromise === operation) {
        startPromise = undefined;
      }
    });
    return operation;
  }

  return {
    dispose: async () => {
      expectedStop = true;
      if (await stop()) {
        releaseChild();
      }
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
