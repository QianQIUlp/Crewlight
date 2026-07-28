import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  copilotHookInputSchema,
  type CopilotHookInput,
} from "./copilot-hook-input.js";

export type CopilotAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["PreToolUse", "using_tool"],
  ["PostToolUse", "running"],
  ["Stop", "completed"],
  ["ErrorOccurred", "failed"],
]);

function eventMessage(
  input: CopilotHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return `Using tool: ${input.tool_name}`;
  }

  return undefined;
}

function toEvent(
  input: CopilotHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);
  const sessionId = input.session_id ?? input.sessionId;

  return {
    source: "copilot-cli",
    surface: "cli",
    status,
    ...(sessionId ? { sessionId } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapCopilotEvent(input: unknown): CopilotAdapterResult {
  const parsed = copilotHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Copilot CLI hook payload" };
  }

  const payload = parsed.data;

  if (payload.hook_event_name === "ErrorOccurred" && payload.recoverable) {
    return {
      kind: "event",
      event: toEvent(payload, "running"),
    };
  }

  if (payload.hook_event_name === "Notification") {
    const status: AgentStatus | undefined =
      payload.notification_type === "permission_prompt"
        ? "waiting_permission"
        : payload.notification_type === "elicitation_dialog"
          ? "waiting_input"
          : undefined;
    if (!status) {
      return {
        kind: "ignored",
        reason: "Copilot CLI notification does not require attention",
      };
    }
    return {
      kind: "event",
      event: toEvent(payload, status),
    };
  }

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Copilot CLI hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
