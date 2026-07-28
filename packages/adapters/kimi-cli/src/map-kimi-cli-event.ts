import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  kimiCliHookInputSchema,
  type KimiCliHookInput,
} from "./kimi-cli-hook-input.js";

export type KimiCliAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["UserPromptSubmit", "running"],
  ["PreToolUse", "using_tool"],
  ["PostToolUse", "running"],
  ["PostToolUseFailure", "running"],
  ["PermissionRequest", "waiting_permission"],
  ["PermissionResult", "running"],
  ["SubagentStart", "using_tool"],
  ["SubagentStop", "running"],
  ["Stop", "completed"],
  ["SessionEnd", "idle"],
  ["Interrupt", "idle"],
]);

function eventMessage(
  input: KimiCliHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return "Using tool: " + input.tool_name;
  }

  return undefined;
}

function toEvent(
  input: KimiCliHookInput,
  status: AgentStatus,
): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "kimi-cli",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapKimiCliEvent(input: unknown): KimiCliAdapterResult {
  const parsed = kimiCliHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid KimiCli hook payload" };
  }

  const payload = parsed.data;

  if (payload.hook_event_name === "StopFailure") {
    return {
      kind: "event",
      event: toEvent(
        payload,
        payload.error === "rate_limit" ? "rate_limited" : "failed",
      ),
    };
  }

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported KimiCli hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
