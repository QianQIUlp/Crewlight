import {
  normalizeAgentEvent,
  SessionStore,
  type AgentEvent,
  type AgentEventInput,
  type AgentSession,
} from "@crewlight/core";
import { ConsoleNotifier, type Notifier } from "@crewlight/notifier";

export interface IngestResult {
  applied: boolean;
  event: AgentEvent;
  session: AgentSession;
}

export class CrewlightService {
  readonly #notifier: Notifier;
  readonly #sessions: SessionStore;

  constructor(
    options: {
      notifier?: Notifier;
      sessions?: SessionStore;
    } = {},
  ) {
    this.#notifier = options.notifier ?? new ConsoleNotifier();
    this.#sessions = options.sessions ?? new SessionStore();
  }

  async ingest(input: AgentEventInput): Promise<IngestResult> {
    const event = normalizeAgentEvent(input);
    const { applied, session } = this.#sessions.applyWithResult(event);

    if (applied) {
      try {
        const delivery = this.#notifier.notify(event, session);
        if (delivery) {
          void delivery.catch(() => undefined);
        }
      } catch {
        // Notification failures must not change an already-applied ingest.
      }
    }

    return { applied, event, session };
  }

  listSessions(): AgentSession[] {
    return this.#sessions.list();
  }
}
