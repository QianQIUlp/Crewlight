import type { AgentEventInput, AgentStatus } from "@crewlight/core";

import {
  openCodePluginInputSchema,
  type OpenCodePluginInput,
} from "./opencode-plugin-input.js";

export const OPENCODE_EVENT_TYPES = [
  "session.created",
  "session.updated",
  "session.status",
  "session.idle",
  "session.error",
  "permission.asked",
  "permission.replied",
  "tool.execute.before",
  "tool.execute.after",
  "message.updated",
] as const;

export type OpenCodeEventType = (typeof OPENCODE_EVENT_TYPES)[number];

export type OpenCodeAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const SIMPLE_STATUS = new Map<OpenCodeEventType, AgentStatus>([
  ["session.created", "running"],
  ["session.updated", "running"],
  ["session.idle", "completed"],
  ["session.error", "failed"],
  ["permission.asked", "waiting_permission"],
  ["permission.replied", "running"],
  ["tool.execute.before", "using_tool"],
  ["tool.execute.after", "running"],
  ["message.updated", "running"],
]);

const GENERIC_MESSAGES = new Map<OpenCodeEventType, string>([
  ["session.created", "OpenCode session started"],
  ["session.updated", "OpenCode session updated"],
  ["session.status", "OpenCode session status updated"],
  ["session.idle", "OpenCode session completed"],
  ["session.error", "OpenCode session failed"],
  ["permission.asked", "OpenCode permission requested"],
  ["permission.replied", "OpenCode permission answered"],
  ["tool.execute.before", "OpenCode tool started"],
  ["tool.execute.after", "OpenCode tool completed"],
  ["message.updated", "OpenCode activity updated"],
]);

export function isOpenCodeEventType(value: string): value is OpenCodeEventType {
  return (OPENCODE_EVENT_TYPES as readonly string[]).includes(value);
}

function sessionStatus(input: OpenCodePluginInput): AgentStatus {
  const status = input.event?.properties?.status;
  const value = typeof status === "string" ? status : status?.type;

  if (value === "idle" || value === "completed" || value === "complete") {
    return "completed";
  }
  if (value === "error" || value === "failed" || value === "failure") {
    return "failed";
  }
  return "running";
}

function safeSessionId(input: OpenCodePluginInput): string | undefined {
  const properties = input.event?.properties;
  return properties?.sessionID ?? properties?.sessionId ?? properties?.info?.id;
}

function safeTimestamp(input: OpenCodePluginInput): number | undefined {
  return (
    input.timestamp ??
    input.event?.timestamp ??
    input.event?.properties?.timestamp
  );
}

export function mapOpenCodeEvent(
  input: unknown,
  eventOverride?: string,
): OpenCodeAdapterResult {
  const parsed = openCodePluginInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid OpenCode plugin payload" };
  }

  const payload = parsed.data;
  const eventType = eventOverride ?? payload.event?.type;
  if (!eventType || !isOpenCodeEventType(eventType)) {
    return { kind: "ignored", reason: "Unsupported OpenCode event" };
  }

  const status =
    eventType === "session.status"
      ? sessionStatus(payload)
      : SIMPLE_STATUS.get(eventType);
  if (!status) {
    return { kind: "ignored", reason: "Unsupported OpenCode event" };
  }

  const sessionId = safeSessionId(payload);
  const projectPath = payload.cwd ?? payload.directory ?? payload.projectPath;
  const timestamp = safeTimestamp(payload);

  return {
    kind: "event",
    event: {
      source: "opencode",
      surface: "unknown",
      status,
      title: eventType,
      message: GENERIC_MESSAGES.get(eventType) ?? "OpenCode activity observed",
      ...(sessionId ? { sessionId } : {}),
      ...(projectPath ? { projectPath } : {}),
      ...(timestamp !== undefined ? { timestamp } : {}),
    },
  };
}
