import type { AgentEvent, AgentSession } from "@crewlight/core";

import type { Notifier } from "./notifier.js";
import { shouldNotify } from "./notification-policy.js";

export type ConsoleWriter = (line: string) => void;

export class ConsoleNotifier implements Notifier {
  readonly #write: ConsoleWriter;

  constructor(write: ConsoleWriter = console.log) {
    this.#write = write;
  }

  notify(event: AgentEvent, session: AgentSession): void {
    if (!shouldNotify(event)) {
      return;
    }

    const location =
      session.workspaceName ?? session.projectPath ?? session.sessionKey;
    const detail = event.message ?? event.title ?? event.status;

    this.#write(
      `[Crewlight][${event.urgency}] ${event.source} ${event.status} ${location}: ${detail}`,
    );
  }
}
