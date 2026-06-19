import { randomUUID } from "node:crypto";

import { agentEventInputSchema, agentEventSchema } from "./schemas.js";
import { deriveSessionKey, normalizeProjectPath } from "./session-key.js";
import type {
  AgentEvent,
  AgentEventInput,
  AgentStatus,
  Urgency,
} from "./types.js";

const HIGH_URGENCY = new Set<AgentStatus>([
  "waiting_input",
  "waiting_permission",
  "failed",
  "rate_limited",
]);

export function defaultUrgency(status: AgentStatus): Urgency {
  if (HIGH_URGENCY.has(status)) {
    return "high";
  }

  return status === "completed" ? "normal" : "low";
}

export function normalizeAgentEvent(
  input: AgentEventInput,
  now: () => number = Date.now,
): AgentEvent {
  const parsed = agentEventInputSchema.parse(input);
  const { rawEvent: _rawEvent, ...safeInput } = parsed;
  const projectPath = safeInput.projectPath
    ? normalizeProjectPath(safeInput.projectPath)
    : undefined;

  return agentEventSchema.parse({
    ...safeInput,
    id: safeInput.id ?? randomUUID(),
    projectPath,
    sessionKey: deriveSessionKey({
      ...safeInput,
      projectPath,
    }),
    timestamp: safeInput.timestamp ?? now(),
    urgency: safeInput.urgency ?? defaultUrgency(safeInput.status),
  });
}
