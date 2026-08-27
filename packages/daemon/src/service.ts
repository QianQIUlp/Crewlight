import {
  evaluateAttention,
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
    const previousSession = this.#sessions.get(event.sessionKey);
    const { applied, session } = this.#sessions.applyWithResult(event);

    if (applied) {
      const attention = evaluateAttention({
        currentSession: session,
        previousSession,
        event,
        now: Date.now(),
      });
      try {
        if (attention.shouldNotify && attention.notificationKind) {
          const delivery = this.#notifier.notify({
            event,
            kind: attention.notificationKind,
            session,
          });
          if (delivery) {
            void delivery.catch(() => undefined);
          }
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
