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
  ["SessionStart", "running"],
  ["PreToolUse", "using_tool"],
  ["PostToolUse", "running"],
  ["Stop", "completed"],
  ["StopFailure", "failed"],
]);

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function eventMessage(
  input: CodewhaleHookInput,
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
  input: CodewhaleHookInput,
  status: AgentStatus,
): AgentEventInput {
  const title =
    optionalText(input.title) ?? optionalText(input.hook_event_name);
  const message = eventMessage(input, status);

  return {
    source: "codewhale",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  };
}

export function mapCodewhaleEvent(input: unknown): CodewhaleAdapterResult {
  const parsed = codewhaleHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Codewhale hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Codewhale hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
