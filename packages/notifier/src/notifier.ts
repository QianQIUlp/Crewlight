import type {
  AgentEvent,
  AgentSession,
  NotificationKind,
} from "@crewlight/core";

export interface NotificationRequest {
  kind: NotificationKind;
  event: AgentEvent;
  session: AgentSession;
}

export interface Notifier {
  notify(request: NotificationRequest): void | Promise<void>;
}
