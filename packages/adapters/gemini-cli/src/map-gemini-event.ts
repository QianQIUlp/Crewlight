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
  ["AfterAgent", "running"],
  ["BeforeTool", "using_tool"],
  ["AfterTool", "running"],
  ["PreCompress", "running"],
  ["SessionEnd", "completed"],
]);

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function eventMessage(
  input: GeminiHookInput,
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

function toEvent(input: GeminiHookInput, status: AgentStatus): AgentEventInput {
  const title =
    optionalText(input.title) ?? optionalText(input.hook_event_name);
  const message = eventMessage(input, status);

  return {
    source: "gemini-cli",
    surface: "cli",
    status,
    ...(input.session_id ? { sessionId: input.session_id } : {}),
    ...(input.cwd ? { projectPath: input.cwd } : {}),
    ...(title ? { title } : {}),
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
    const status: AgentStatus =
      payload.notification_type === "permission_prompt"
        ? "waiting_permission"
        : "waiting_input";
    return {
      kind: "event",
      event: toEvent(payload, status),
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
