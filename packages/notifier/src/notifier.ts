import type { AgentEvent, AgentSession } from "@crewlight/core";

export interface Notifier {
  notify(event: AgentEvent, session: AgentSession): void | Promise<void>;
}
