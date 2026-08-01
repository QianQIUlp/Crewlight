import type { AgentEvent, AgentSession } from "@crewlight/core";

import type { Notifier } from "./notifier.js";
import { shouldNotify } from "./notification-policy.js";
import { isUsableWindowsToasterAsset } from "./windows-notifier.js";

export const OS_NOTIFICATION_TITLE_LIMIT = 80;
export const OS_NOTIFICATION_MESSAGE_LIMIT = 200;
export const OS_NOTIFICATION_TIMEOUT_MS = 1_000;
export const OS_NOTIFIER_PROBE_TIMEOUT_MS = 1_000;

export const OS_NOTIFIER_WARNINGS = {
  asset:
    "Crewlight warning: the packaged Windows notification helper is missing or failed its integrity check. Desktop notifications are unavailable, but the daemon will continue ingesting events. Reinstall Crewlight or restart with `crewlight daemon --notifier console`.",
  callback:
    "Crewlight warning: the OS notifier reported a delivery failure. The event was ingested, but no desktop notification was confirmed. The daemon is still running. Fallback: restart with `crewlight daemon --notifier console`.",
  import:
    "Crewlight warning: the OS notifier module could not be loaded. Desktop notifications are unavailable, but the daemon will continue ingesting events. Fallback: restart with `crewlight daemon --notifier console`.",
  runtime:
    "Crewlight warning: the OS notifier failed while sending a notification. The event was ingested and the daemon is still running. Fallback: restart with `crewlight daemon --notifier console`.",
  shape:
    "Crewlight warning: the installed OS notifier module has an unsupported interface. Desktop notifications are unavailable, but the daemon will continue ingesting events. Fallback: restart with `crewlight daemon --notifier console`.",
  timeout:
    "Crewlight warning: the OS notifier timed out before confirming delivery. The event was ingested and the daemon is still running. Fallback: restart with `crewlight daemon --notifier console`.",
} as const;

export interface OsNotification {
  title: string;
  message: string;
}

export type OsNotificationCallback = (error?: Error | null) => void;
export type OsNotificationSender = (
  notification: OsNotification,
  callback: OsNotificationCallback,
) => void;
type OsNotificationSenderLoadResult =
  | { kind: "ready"; sender: OsNotificationSender }
  | { kind: "unavailable"; reason: "asset" | "import" | "shape" };
export type OsNotifierModuleLoader = () => Promise<unknown>;
export type OsNotifierWarningWriter = (warning: string) => void;

export interface OsNotifierOptions {
  assetVerifier?: (path: string) => Promise<boolean>;
  loader?: OsNotifierModuleLoader;
  timeoutMs?: number;
  warning?: OsNotifierWarningWriter;
  windowsToasterPath?: string;
}

export type OsNotifierProbeResult =
  | { available: true }
  | { available: false; reason: "asset" | "import" | "shape" };

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1)}…`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function senderFromCandidate(
  candidate: Record<string, unknown> | undefined,
): OsNotificationSender | undefined {
  const notify = candidate?.notify;
  if (typeof notify !== "function") {
    return undefined;
  }

  return (notification, callback) => {
    notify.call(candidate, notification, callback);
  };
}

function senderFromModule(
  module: unknown,
  windowsToasterPath?: string,
): OsNotificationSender | undefined {
  const namespace = record(module);
  const defaultCandidate = record(namespace?.default);

  if (windowsToasterPath) {
    const constructor =
      defaultCandidate?.WindowsToaster ?? namespace?.WindowsToaster;
    if (typeof constructor !== "function") {
      return undefined;
    }
    const WindowsToaster = constructor as new (options: {
      customPath: string;
      withFallback: boolean;
    }) => unknown;
    return senderFromCandidate(
      record(
        new WindowsToaster({
          customPath: windowsToasterPath,
          withFallback: false,
        }),
      ),
    );
  }

  return senderFromCandidate(defaultCandidate ?? namespace);
}

export async function probeOsNotifier(
  loader: OsNotifierModuleLoader = () => import("node-notifier"),
  timeoutMs = OS_NOTIFIER_PROBE_TIMEOUT_MS,
  windowsToasterPath?: string,
  assetVerifier: (
    path: string,
  ) => Promise<boolean> = isUsableWindowsToasterAsset,
): Promise<OsNotifierProbeResult> {
  if (windowsToasterPath && !(await assetVerifier(windowsToasterPath))) {
    return { available: false, reason: "asset" };
  }

  const timedOut = Symbol("os-notifier-probe-timeout");
  let timeout: NodeJS.Timeout | undefined;
  let module: unknown | typeof timedOut;

  try {
    module = await Promise.race([
      loader(),
      new Promise<typeof timedOut>((resolve) => {
        timeout = setTimeout(() => resolve(timedOut), timeoutMs);
      }),
    ]);
  } catch {
    return { available: false, reason: "import" };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (module === timedOut) {
    return { available: false, reason: "import" };
  }

  try {
    return senderFromModule(module, windowsToasterPath)
      ? { available: true }
      : { available: false, reason: "shape" };
  } catch {
    return { available: false, reason: "shape" };
  }
}

export function formatOsNotification(
  event: AgentEvent,
  session: AgentSession,
): OsNotification {
  const location =
    session.workspaceName ?? session.projectPath ?? session.sessionKey;
  const detail = event.message ?? event.title ?? event.status;

  return {
    title: truncate(
      `Crewlight · ${event.source} · ${event.status}`,
      OS_NOTIFICATION_TITLE_LIMIT,
    ),
    message: truncate(`${location}: ${detail}`, OS_NOTIFICATION_MESSAGE_LIMIT),
  };
}

export class OsNotifier implements Notifier {
  readonly #assetVerifier: (path: string) => Promise<boolean>;
  readonly #loader: OsNotifierModuleLoader;
  readonly #timeoutMs: number;
  readonly #warning: OsNotifierWarningWriter;
  readonly #windowsToasterPath: string | undefined;
  #senderPromise: Promise<OsNotificationSenderLoadResult> | undefined;

  constructor(options: OsNotifierOptions = {}) {
    this.#assetVerifier = options.assetVerifier ?? isUsableWindowsToasterAsset;
    this.#loader = options.loader ?? (() => import("node-notifier"));
    this.#timeoutMs = options.timeoutMs ?? OS_NOTIFICATION_TIMEOUT_MS;
    this.#warning = options.warning ?? console.warn;
    this.#windowsToasterPath = options.windowsToasterPath;
  }

  async notify(event: AgentEvent, session: AgentSession): Promise<void> {
    if (!shouldNotify(event)) {
      return;
    }

    const notification = formatOsNotification(event, session);

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.#warn(OS_NOTIFIER_WARNINGS.timeout);
        finish();
      }, this.#timeoutMs);

      void this.#loadSender().then(
        (result) => {
          if (settled) {
            return;
          }
          if (result.kind === "unavailable") {
            this.#warn(OS_NOTIFIER_WARNINGS[result.reason]);
            finish();
            return;
          }

          try {
            result.sender(notification, (error) => {
              if (settled) {
                return;
              }

              if (error) {
                this.#warn(OS_NOTIFIER_WARNINGS.callback);
              }
              finish();
            });
          } catch {
            this.#warn(OS_NOTIFIER_WARNINGS.runtime);
            finish();
          }
        },
        () => {
          if (!settled) {
            this.#warn(OS_NOTIFIER_WARNINGS.import);
            finish();
          }
        },
      );
    });
  }

  async #loadSender(): Promise<OsNotificationSenderLoadResult> {
    this.#senderPromise ??= this.#createSender();
    return this.#senderPromise;
  }

  async #createSender(): Promise<OsNotificationSenderLoadResult> {
    let module: unknown;

    if (
      this.#windowsToasterPath &&
      !(await this.#assetVerifier(this.#windowsToasterPath))
    ) {
      return { kind: "unavailable", reason: "asset" };
    }

    try {
      module = await this.#loader();
    } catch {
      return { kind: "unavailable", reason: "import" };
    }

    let sender: OsNotificationSender | undefined;
    try {
      sender = senderFromModule(module, this.#windowsToasterPath);
    } catch {
      return { kind: "unavailable", reason: "shape" };
    }

    if (!sender) {
      return { kind: "unavailable", reason: "shape" };
    }

    return { kind: "ready", sender };
  }

  #warn(message: string): void {
    try {
      this.#warning(message);
    } catch {
      // Warning output must never turn a notification failure into ingest failure.
    }
  }
}
