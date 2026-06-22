import type { AgentEvent, AgentStatus } from "@crewlight/core";

const DEFAULT_NOTIFICATION_STATUSES = new Set<AgentStatus>([
  "waiting_input",
  "waiting_permission",
  "completed",
  "failed",
  "rate_limited",
]);

export function shouldNotify(event: AgentEvent): boolean {
  return DEFAULT_NOTIFICATION_STATUSES.has(event.status);
}
