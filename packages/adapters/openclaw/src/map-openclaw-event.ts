import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  openclawHookInputSchema,
  type OpenclawHookInput,
} from "./openclaw-hook-input.js";

export type OpenclawAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["PreToolUse", "using_tool"],
  ["PostToolUse", "running"],
  ["Stop", "completed"],
  ["StopFailure", "failed"],
]);

function eventMessage(
  input: OpenclawHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: OpenclawHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "openclaw",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapOpenclawEvent(input: unknown): OpenclawAdapterResult {
  const parsed = openclawHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Openclaw hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Openclaw hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
