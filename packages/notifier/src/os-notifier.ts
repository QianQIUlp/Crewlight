import type { AgentEvent, AgentSession } from "@agentpulse/core";

import type { Notifier } from "./notifier.js";
import { shouldNotify } from "./notification-policy.js";

export const OS_NOTIFICATION_TITLE_LIMIT = 80;
export const OS_NOTIFICATION_MESSAGE_LIMIT = 200;
export const OS_NOTIFICATION_TIMEOUT_MS = 1_000;

export const OS_NOTIFIER_WARNINGS = {
  callback:
    "AgentPulse OS notification failed in its callback; continuing without interrupting the daemon.",
  import:
    "AgentPulse OS notification module could not be loaded; continuing without OS notifications.",
  runtime:
    "AgentPulse OS notification failed at runtime; continuing without interrupting the daemon.",
  shape:
    "AgentPulse OS notification module is unsupported; continuing without OS notifications.",
  timeout:
    "AgentPulse OS notification timed out; continuing without interrupting the daemon.",
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

export function formatOsNotification(
  event: AgentEvent,
  session: AgentSession,
): OsNotification {
  const location =
    session.workspaceName ?? session.projectPath ?? session.sessionKey;
  const detail = event.message ?? event.title ?? event.status;

  return {
    title: truncate(
      `AgentPulse · ${event.source} · ${event.status}`,
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
