import type { Notifier } from "./notifier.js";
import type { NotificationRequest } from "./notifier.js";

export type ConsoleWriter = (line: string) => void;

const CONSOLE_FIELD_MAX_LENGTH = 1_024;
const UNSAFE_SINGLE_LINE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;

function safeConsoleField(value: string): string {
  const sanitized = value.replace(UNSAFE_SINGLE_LINE_CHARACTERS, "");

  if (sanitized.length <= CONSOLE_FIELD_MAX_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, CONSOLE_FIELD_MAX_LENGTH - 1)}…`;
}

export class ConsoleNotifier implements Notifier {
  readonly #write: ConsoleWriter;

  constructor(write: ConsoleWriter = console.log) {
    this.#write = write;
  }

  notify({ event, kind, session }: NotificationRequest): void {
    const location = safeConsoleField(
      session.workspaceName ?? session.projectPath ?? session.sessionKey,
    );
    const detail = safeConsoleField(
      event.message ?? event.title ?? event.status,
    );

    this.#write(
      `[Crewlight][${safeConsoleField(kind)}] ${safeConsoleField(event.source)} ${safeConsoleField(notificationLabel(kind))} ${location}: ${detail}`,
    );
  }
}

function notificationLabel(kind: NotificationRequest["kind"]): string {
  switch (kind) {
    case "input":
      return "Input needed";
    case "permission":
      return "Permission needed";
    case "failed":
      return "Agent failed";
    case "rate_limit":
      return "Rate limited";
    case "ready":
      return "Ready for review";
  }
}
