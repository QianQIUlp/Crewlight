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
  ["start", "running"],
  ["tool_use", "using_tool"],
  ["finish", "completed"],
  ["error", "failed"],
]);

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function eventMessage(
  input: HermesAgentHookInput,
  status: AgentStatus,
): string | undefined {
  const explicit = optionalText(input.message);
  if (explicit) {
    return explicit;
  }

  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: HermesAgentHookInput,
  status: AgentStatus,
): AgentEventInput {
  const title =
    optionalText(input.title) ?? optionalText(input.hook_event_name);
  const message = eventMessage(input, status);

  return {
    source: "hermes-agent",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  };
}

export function mapHermesAgentEvent(input: unknown): HermesAgentAdapterResult {
  const parsed = hermesAgentHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid HermesAgent hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported HermesAgent hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
