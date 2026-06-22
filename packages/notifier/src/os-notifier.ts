import type { AgentEvent, AgentSession } from "@crewlight/core";

import type { Notifier } from "./notifier.js";
import { shouldNotify } from "./notification-policy.js";

export const OS_NOTIFICATION_TITLE_LIMIT = 80;
export const OS_NOTIFICATION_MESSAGE_LIMIT = 200;
export const OS_NOTIFICATION_TIMEOUT_MS = 1_000;

export const OS_NOTIFIER_WARNINGS = {
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
export type OsNotifierModuleLoader = () => Promise<unknown>;
export type OsNotifierWarningWriter = (warning: string) => void;

export interface OsNotifierOptions {
  loader?: OsNotifierModuleLoader;
  timeoutMs?: number;
  warning?: OsNotifierWarningWriter;
}

export type OsNotifierProbeResult =
  | { available: true }
  | { available: false; reason: "import" | "shape" };

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

function senderFromModule(module: unknown): OsNotificationSender | undefined {
  const namespace = record(module);
  const candidate = record(namespace?.default) ?? namespace;
  const notify = candidate?.notify;

  if (typeof notify !== "function") {
    return undefined;
  }

  return (notification, callback) => {
    notify.call(candidate, notification, callback);
  };
}

export async function probeOsNotifier(
  loader: OsNotifierModuleLoader = () => import("node-notifier"),
): Promise<OsNotifierProbeResult> {
  let module: unknown;

  try {
    module = await loader();
  } catch {
    return { available: false, reason: "import" };
  }

  try {
    return senderFromModule(module)
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
  readonly #loader: OsNotifierModuleLoader;
  readonly #timeoutMs: number;
  readonly #warning: OsNotifierWarningWriter;
  #senderPromise: Promise<OsNotificationSender | undefined> | undefined;

  constructor(options: OsNotifierOptions = {}) {
    this.#loader = options.loader ?? (() => import("node-notifier"));
    this.#timeoutMs = options.timeoutMs ?? OS_NOTIFICATION_TIMEOUT_MS;
    this.#warning = options.warning ?? console.warn;
  }

  async notify(event: AgentEvent, session: AgentSession): Promise<void> {
    if (!shouldNotify(event)) {
      return;
    }

    const sender = await this.#loadSender();
    if (!sender) {
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

      try {
        sender(notification, (error) => {
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
    });
  }

  async #loadSender(): Promise<OsNotificationSender | undefined> {
    this.#senderPromise ??= this.#createSender();
    return this.#senderPromise;
  }

  async #createSender(): Promise<OsNotificationSender | undefined> {
    let module: unknown;

    try {
      module = await this.#loader();
    } catch {
      this.#warn(OS_NOTIFIER_WARNINGS.import);
      return undefined;
    }

    let sender: OsNotificationSender | undefined;
    try {
      sender = senderFromModule(module);
    } catch {
      this.#warn(OS_NOTIFIER_WARNINGS.shape);
      return undefined;
    }

    if (!sender) {
      this.#warn(OS_NOTIFIER_WARNINGS.shape);
      return undefined;
    }

    return sender;
  }

  #warn(message: string): void {
    try {
      this.#warning(message);
    } catch {
      // Warning output must never turn a notification failure into ingest failure.
    }
  }
}
