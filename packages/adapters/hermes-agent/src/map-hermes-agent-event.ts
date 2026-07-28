import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  hermesAgentHookInputSchema,
  type HermesAgentHookInput,
} from "./hermes-agent-hook-input.js";

export type HermesAgentAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["on_session_start", "running"],
  ["pre_llm_call", "running"],
  ["pre_tool_call", "using_tool"],
  ["post_tool_call", "running"],
  ["post_llm_call", "completed"],
  ["pre_approval_request", "waiting_permission"],
  ["post_approval_response", "running"],
  ["subagent_start", "using_tool"],
  ["subagent_stop", "running"],
  ["on_session_finalize", "completed"],
  ["on_session_reset", "completed"],
]);

function sessionEndStatus(input: HermesAgentHookInput): AgentStatus {
  if (input.extra?.interrupted === true) {
    return "idle";
  }
  if (input.extra?.completed === true) {
    // post_llm_call is the successful-turn completion signal. Treat the
    // subsequent session cleanup as idle so it cannot notify twice.
    return "idle";
  }
  if (input.extra?.completed === false) {
    return "failed";
  }
  return "unknown";
}

function eventMessage(
  input: HermesAgentHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: HermesAgentHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "hermes-agent",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapHermesAgentEvent(input: unknown): HermesAgentAdapterResult {
  const parsed = hermesAgentHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid HermesAgent hook payload" };
  }

  const payload = parsed.data;

  const status =
    payload.hook_event_name === "on_session_end"
      ? sessionEndStatus(payload)
      : STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported HermesAgent hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
