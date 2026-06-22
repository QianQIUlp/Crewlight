import {
  formatPromptPreviewTaskTitle,
  type AgentEventInput,
  type AgentStatus,
} from "@crewlight/core";

import {
  claudeHookInputSchema,
  type ClaudeHookInput,
} from "./claude-hook-input.js";

export type ClaudeAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

export interface ClaudeAdapterOptions {
  promptPreview?: boolean;
}

const SIMPLE_STATUS = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["UserPromptSubmit", "running"],
  ["PreToolUse", "using_tool"],
  ["PostToolUse", "running"],
  ["PermissionRequest", "waiting_permission"],
  ["Stop", "completed"],
]);

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function eventMessage(
  input: ClaudeHookInput,
  status: AgentStatus,
): string | undefined {
  if (input.hook_event_name === "UserPromptSubmit") {
    return undefined;
  }

  const explicit =
    optionalText(input.message) ??
    optionalText(input.last_assistant_message) ??
    optionalText(input.error_details);

  if (explicit) {
    return explicit;
  }

  if (status === "using_tool" && input.tool_name) {
    return `Using tool: ${input.tool_name}`;
  }

  return undefined;
}

function toEvent(
  input: ClaudeHookInput,
  status: AgentStatus,
  options: ClaudeAdapterOptions,
): AgentEventInput {
  const title =
    optionalText(input.title) ?? optionalText(input.hook_event_name);
  const message = eventMessage(input, status);
  const taskTitle =
    options.promptPreview && input.hook_event_name === "UserPromptSubmit"
      ? formatPromptPreviewTaskTitle(input.prompt)
      : undefined;

  return {
    source: "claude-code",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    ...(taskTitle ? { taskTitle } : {}),
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  };
}

export function mapClaudeEvent(
  input: unknown,
  options: ClaudeAdapterOptions = {},
): ClaudeAdapterResult {
  const parsed = claudeHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Claude Code hook payload" };
  }

  const payload = parsed.data;

  if (payload.hook_event_name === "SessionEnd") {
    return {
      kind: "ignored",
      reason: "Claude Code SessionEnd is ignored in Crewlight v0.2",
    };
  }

  if (payload.hook_event_name === "Notification") {
    if (payload.notification_type === "permission_prompt") {
      return {
        kind: "event",
        event: toEvent(payload, "waiting_permission", options),
      };
    }

    if (payload.notification_type === "idle_prompt") {
      return {
        kind: "event",
        event: toEvent(payload, "waiting_input", options),
      };
    }

    return {
      kind: "ignored",
      reason: "Unsupported Claude Code notification type",
    };
  }

  if (payload.hook_event_name === "StopFailure") {
    const errorType = payload.error ?? payload.error_type;
    const status: AgentStatus =
      errorType === "rate_limit" ? "rate_limited" : "failed";
    return { kind: "event", event: toEvent(payload, status, options) };
  }

  const status = SIMPLE_STATUS.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Claude Code hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status, options) };
}
