import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  antigravityHookInputSchema,
  type AntigravityHookInput,
} from "./antigravity-hook-input.js";

export type AntigravityAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["BeforeTool", "using_tool"],
  ["PreToolUse", "using_tool"],
  ["AfterTool", "running"],
  ["PostToolUse", "running"],
  ["Stop", "completed"],
  ["StopFailure", "failed"],
  ["SessionEnd", "completed"],
]);

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function eventMessage(
  input: AntigravityHookInput,
  status: AgentStatus,
): string | undefined {
  const explicit = optionalText(input.message);
  if (explicit) {
    return explicit;
  }

  if (status === "using_tool" && input.tool_name) {
    return `Using tool: ${input.tool_name}`;
  }

  return undefined;
}

function toEvent(
  input: AntigravityHookInput,
  status: AgentStatus,
): AgentEventInput {
  const title =
    optionalText(input.title) ?? optionalText(input.hook_event_name);
  const message = eventMessage(input, status);

  return {
    source: "antigravity",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  };
}

export function mapAntigravityEvent(input: unknown): AntigravityAdapterResult {
  const parsed = antigravityHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Antigravity hook payload" };
  }

  const payload = parsed.data;

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Antigravity hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
