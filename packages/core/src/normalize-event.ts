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

function sanitizeAgentString(value: string | undefined): string | undefined {
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
    ...(safeInput.id !== undefined
      ? { id: sanitizeAgentString(safeInput.id) }
      : {}),
    ...(safeInput.sessionId !== undefined
      ? { sessionId: sanitizeAgentString(safeInput.sessionId) }
      : {}),
    ...(safeInput.projectPath !== undefined
      ? { projectPath: sanitizeAgentString(safeInput.projectPath) }
      : {}),
    ...(safeInput.workspaceName !== undefined
      ? { workspaceName: sanitizeAgentString(safeInput.workspaceName) }
      : {}),
    ...(safeInput.taskTitle !== undefined
      ? { taskTitle: sanitizeAgentString(safeInput.taskTitle) }
      : {}),
    ...(safeInput.title !== undefined
      ? { title: sanitizeAgentString(safeInput.title) }
      : {}),
    ...(safeInput.message !== undefined
      ? { message: sanitizeAgentString(safeInput.message) }
      : {}),
    ...(safeInput.remoteAlias !== undefined
      ? { remoteAlias: sanitizeAgentString(safeInput.remoteAlias) }
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
