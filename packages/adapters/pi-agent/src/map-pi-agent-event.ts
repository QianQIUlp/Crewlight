import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  piAgentHookInputSchema,
  type PiAgentHookInput,
} from "./pi-agent-hook-input.js";

export type PiAgentAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["start", "running"],
  ["tool_use", "using_tool"],
  ["finish", "completed"],
  ["error", "failed"],
]);

function eventMessage(
  input: PiAgentHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: PiAgentHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "pi-agent",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapPiAgentEvent(input: unknown): PiAgentAdapterResult {
  const parsed = piAgentHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid PiAgent hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported PiAgent hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
