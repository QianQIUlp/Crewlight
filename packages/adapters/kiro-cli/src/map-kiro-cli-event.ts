import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  kiroCliHookInputSchema,
  type KiroCliHookInput,
} from "./kiro-cli-hook-input.js";

export type KiroCliAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["agentSpawn", "running"],
  ["userPromptSubmit", "running"],
  ["preToolUse", "using_tool"],
  ["postToolUse", "running"],
  ["stop", "completed"],
]);

function eventMessage(
  input: KiroCliHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: KiroCliHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "kiro-cli",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapKiroCliEvent(input: unknown): KiroCliAdapterResult {
  const parsed = kiroCliHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid KiroCli hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported KiroCli hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
