import type {
  AgentEventInput,
  AgentStatus,
  AgentSurface,
} from "@crewlight/core";

import {
  cursorBridgeInputSchema,
  type CursorBridgeInput,
} from "./cursor-bridge-input.js";

export const CURSOR_EVENT_NAMES = [
  "running",
  "start",
  "active",
  "tool",
  "using-tool",
  "waiting-input",
  "needs-review",
  "review",
  "waiting-permission",
  "permission",
  "completed",
  "done",
  "success",
  "failed",
  "error",
  "rate-limited",
  "idle",
  "unknown",
  "note",
] as const;

export type CursorEventName = (typeof CURSOR_EVENT_NAMES)[number];
export type CursorSurface = Extract<
  AgentSurface,
  "ide-extension" | "desktop" | "manual"
>;

export type CursorAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const EVENT_STATUSES = new Map<CursorEventName, AgentStatus>([
  ["running", "running"],
  ["start", "running"],
  ["active", "running"],
  ["tool", "using_tool"],
  ["using-tool", "using_tool"],
  ["waiting-input", "waiting_input"],
  ["needs-review", "waiting_input"],
  ["review", "waiting_input"],
  ["waiting-permission", "waiting_permission"],
  ["permission", "waiting_permission"],
  ["completed", "completed"],
  ["done", "completed"],
  ["success", "completed"],
  ["failed", "failed"],
  ["error", "failed"],
  ["rate-limited", "rate_limited"],
  ["idle", "idle"],
  ["unknown", "unknown"],
  ["note", "unknown"],
]);

export function isCursorEventName(value: string): value is CursorEventName {
  return (CURSOR_EVENT_NAMES as readonly string[]).includes(value);
}

function normalizeEventName(value: string): string {
  return value.trim().toLowerCase();
}

export function mapCursorBridgeEvent(input: unknown): CursorAdapterResult {
  const parsed = cursorBridgeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Cursor bridge payload" };
  }

  const payload: CursorBridgeInput = parsed.data;
  const eventName = normalizeEventName(payload.event);
  if (!isCursorEventName(eventName)) {
    return { kind: "ignored", reason: "Unsupported Cursor bridge event" };
  }

  const status = EVENT_STATUSES.get(eventName);
  if (!status) {
    return { kind: "ignored", reason: "Unsupported Cursor bridge event" };
  }

  return {
    kind: "event",
    event: {
      source: "cursor",
      surface: payload.surface ?? "ide-extension",
      status,
      ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
      ...(payload.workspaceName
        ? { workspaceName: payload.workspaceName }
        : {}),
      ...(payload.projectPath ? { projectPath: payload.projectPath } : {}),
      ...(payload.title ? { taskTitle: payload.title } : {}),
      ...(payload.message ? { message: payload.message } : {}),
      ...(payload.timestamp !== undefined
        ? { timestamp: payload.timestamp }
        : {}),
    },
  };
}
