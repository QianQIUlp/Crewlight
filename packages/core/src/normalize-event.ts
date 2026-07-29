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

const UNSAFE_SINGLE_LINE_CHARACTERS =
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;

// Display-only values do not participate in identity and remain safely scrubbed.
function sanitizeDisplayString(value: string | undefined): string | undefined {
  return value?.replace(UNSAFE_SINGLE_LINE_CHARACTERS, "");
}

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
  const sanitizedInput = agentEventInputSchema.parse({
    ...safeInput,
    ...(safeInput.workspaceName !== undefined
      ? { workspaceName: sanitizeDisplayString(safeInput.workspaceName) }
      : {}),
    ...(safeInput.taskTitle !== undefined
      ? { taskTitle: sanitizeDisplayString(safeInput.taskTitle) }
      : {}),
    ...(safeInput.title !== undefined
      ? { title: sanitizeDisplayString(safeInput.title) }
      : {}),
    ...(safeInput.message !== undefined
      ? { message: sanitizeDisplayString(safeInput.message) }
      : {}),
  });
  const projectPath = sanitizedInput.projectPath
    ? normalizeProjectPath(
        sanitizedInput.projectPath,
        sanitizedInput.remoteAlias,
      )
    : undefined;
  const normalizedAt = now();
  // Bound ordering to receipt time so a skewed or hostile clock cannot pin a session.
  const timestamp = Math.min(
    sanitizedInput.timestamp ?? normalizedAt,
    normalizedAt,
  );

  return agentEventSchema.parse({
    ...sanitizedInput,
    id: sanitizedInput.id ?? randomUUID(),
    ...(projectPath ? { projectPath } : {}),
    sessionKey: deriveSessionKey({
      ...sanitizedInput,
      projectPath,
    }),
    timestamp,
    urgency: sanitizedInput.urgency ?? defaultUrgency(sanitizedInput.status),
  });
}
