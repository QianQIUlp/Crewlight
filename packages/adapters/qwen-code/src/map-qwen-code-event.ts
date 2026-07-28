import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  qwenCodeHookInputSchema,
  type QwenCodeHookInput,
} from "./qwen-code-hook-input.js";

export type QwenCodeAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["UserPromptSubmit", "running"],
  ["PreToolUse", "using_tool"],
  ["PostToolUse", "running"],
  ["PostToolUseFailure", "running"],
  ["PermissionRequest", "waiting_permission"],
  ["SubagentStart", "using_tool"],
  ["SubagentStop", "running"],
  ["Stop", "completed"],
  ["SessionEnd", "idle"],
]);

function eventMessage(
  input: QwenCodeHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: QwenCodeHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "qwen-code",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapQwenCodeEvent(input: unknown): QwenCodeAdapterResult {
  const parsed = qwenCodeHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid QwenCode hook payload" };
  }

  const payload = parsed.data;

  if (payload.hook_event_name === "Notification") {
    const status: AgentStatus | undefined =
      payload.notification_type === "permission_prompt"
        ? "waiting_permission"
        : payload.notification_type === "idle_prompt"
          ? "waiting_input"
          : undefined;
    if (!status) {
      return {
        kind: "ignored",
        reason: "Qwen Code notification does not require attention",
      };
    }
    return { kind: "event", event: toEvent(payload, status) };
  }

  if (payload.hook_event_name === "StopFailure") {
    return {
      kind: "event",
      event: toEvent(
        payload,
        payload.error === "rate_limit" ? "rate_limited" : "failed",
      ),
    };
  }

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported QwenCode hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
