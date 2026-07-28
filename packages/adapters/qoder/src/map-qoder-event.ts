import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  qoderHookInputSchema,
  type QoderHookInput,
} from "./qoder-hook-input.js";

export type QoderAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["UserPromptSubmit", "running"],
  ["PreToolUse", "using_tool"],
  ["PostToolUse", "running"],
  ["PostToolUseFailure", "running"],
  ["Stop", "completed"],
  ["SessionEnd", "idle"],
]);

function eventMessage(
  input: QoderHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(input: QoderHookInput, status: AgentStatus): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "qoder",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapQoderEvent(input: unknown): QoderAdapterResult {
  const parsed = qoderHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Qoder hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Qoder hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
