import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  codewhaleHookInputSchema,
  type CodewhaleHookInput,
} from "./codewhale-hook-input.js";

export type CodewhaleAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["session_start", "running"],
  ["message_submit", "running"],
  ["tool_call_before", "using_tool"],
  ["tool_call_after", "running"],
  ["turn_end", "completed"],
  ["on_error", "failed"],
  ["session_end", "completed"],
  ["subagent_spawn", "using_tool"],
  ["subagent_complete", "running"],
]);

function eventMessage(
  input: CodewhaleHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: CodewhaleHookInput,
  status: AgentStatus,
  eventName: string,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "codewhale",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.workspace || input.cwd
      ? { projectPath: input.workspace ?? input.cwd }
      : {}),
    title: eventName,
    ...(message ? { message } : {}),
  };
}

export function mapCodewhaleEvent(input: unknown): CodewhaleAdapterResult {
  const parsed = codewhaleHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Codewhale hook payload" };
  }

  const payload = parsed.data;
  const eventName = payload.event ?? payload.hook_event_name;
  if (!eventName) {
    return { kind: "invalid", reason: "Invalid Codewhale hook payload" };
  }

  const status =
    eventName === "turn_end" &&
    (payload.status === "failed" || payload.status === "error")
      ? "failed"
      : STATUS_MAP.get(eventName);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Codewhale hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status, eventName) };
}
