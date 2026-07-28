import { type AgentEventInput, type AgentStatus } from "@crewlight/core";

import {
  geminiHookInputSchema,
  type GeminiHookInput,
} from "./gemini-hook-input.js";

export type GeminiAdapterResult =
  | { kind: "event"; event: AgentEventInput }
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string };

const STATUS_MAP = new Map<string, AgentStatus>([
  ["SessionStart", "running"],
  ["BeforeAgent", "running"],
  ["AfterAgent", "completed"],
  ["BeforeTool", "using_tool"],
  ["AfterTool", "running"],
  ["PreCompress", "running"],
  ["SessionEnd", "idle"],
]);

function eventMessage(
  input: GeminiHookInput,
  status: AgentStatus,
): string | undefined {
  if (status === "using_tool" && input.tool_name) {
    return `Using tool: ${input.tool_name}`;
  }

  return undefined;
}

function toEvent(input: GeminiHookInput, status: AgentStatus): AgentEventInput {
  const message = eventMessage(input, status);

  return {
    source: "gemini-cli",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    title: input.hook_event_name,
    ...(message ? { message } : {}),
  };
}

export function mapGeminiEvent(input: unknown): GeminiAdapterResult {
  const parsed = geminiHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Gemini CLI hook payload" };
  }

  const payload = parsed.data;

  if (payload.hook_event_name === "Notification") {
    if (payload.notification_type !== "ToolPermission") {
      return {
        kind: "ignored",
        reason: "Unsupported Gemini CLI notification type",
      };
    }
    return {
      kind: "event",
      event: toEvent(payload, "waiting_permission"),
    };
  }

  const status = STATUS_MAP.get(payload.hook_event_name);
  if (!status) {
    return {
      kind: "ignored",
      reason: "Unsupported Gemini CLI hook event",
    };
  }

  return { kind: "event", event: toEvent(payload, status) };
}
