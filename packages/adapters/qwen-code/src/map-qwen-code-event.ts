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
  input: QwenCodeHookInput,
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
  input: QwenCodeHookInput,
  status: AgentStatus,
): AgentEventInput {
  const title =
    optionalText(input.title) ?? optionalText(input.hook_event_name);
  const message = eventMessage(input, status);

  return {
    source: "qwen-code",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  };
}

export function mapQwenCodeEvent(input: unknown): QwenCodeAdapterResult {
  const parsed = qwenCodeHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid QwenCode hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported QwenCode hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
