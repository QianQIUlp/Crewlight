import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  codebuddyHookInputSchema,
  type CodebuddyHookInput,
} from "./codebuddy-hook-input.js";

export type CodebuddyAdapterResult =
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
  ["Stop", "completed"],
  ["StopFailure", "failed"],
  ["SessionEnd", "idle"],
]);

function eventMessage(
  input: CodebuddyHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: CodebuddyHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "codebuddy",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapCodebuddyEvent(input: unknown): CodebuddyAdapterResult {
  const parsed = codebuddyHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Codebuddy hook payload" };
  }

  const payload = parsed.data;

  if (payload.hook_event_name === "Notification") {
    if (payload.notification_type !== "permission_prompt") {
      return {
        kind: "ignored",
        reason: "CodeBuddy notification does not require attention",
      };
    }
    return {
      kind: "event",
      event: toEvent(payload, "waiting_permission"),
    };
  }

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Codebuddy hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
