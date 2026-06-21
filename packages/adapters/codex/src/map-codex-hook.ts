import {
  formatPromptPreviewTaskTitle,
  AgentEventInput,
  AgentStatus,
  AgentSurface,
} from "@agentpulse/core";

import { codexHookInputSchema } from "./codex-hook-input.js";
import type { CodexAdapterResult } from "./map-codex-notification.js";

export const CODEX_HOOK_EVENT_NAMES = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "Stop",
] as const;

export type CodexHookEventName = (typeof CODEX_HOOK_EVENT_NAMES)[number];

export interface CodexHookAdapterOptions {
  promptPreview?: boolean;
}

const CODEX_HOOK_STATUS = new Map<CodexHookEventName, AgentStatus>([
  ["SessionStart", "running"],
  ["UserPromptSubmit", "running"],
  ["PreToolUse", "using_tool"],
  ["PermissionRequest", "waiting_permission"],
  ["PostToolUse", "running"],
  ["Stop", "completed"],
]);

export const CODEX_HOOK_TOOL_NAME_LIMIT = 120;

export function isCodexHookEventName(
  value: string,
): value is CodexHookEventName {
  return CODEX_HOOK_STATUS.has(value as CodexHookEventName);
}

function safeToolName(toolName: string | undefined): string | undefined {
  const trimmed = toolName?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length <= CODEX_HOOK_TOOL_NAME_LIMIT
    ? trimmed
    : `${trimmed.slice(0, CODEX_HOOK_TOOL_NAME_LIMIT - 1)}…`;
}

export function mapCodexHook(
  input: unknown,
  hookEventOverride?: string,
  surface: AgentSurface = "unknown",
  options: CodexHookAdapterOptions = {},
): CodexAdapterResult {
  const parsed = codexHookInputSchema.safeParse(input);
  if (!parsed.success) {
    return { kind: "invalid", reason: "Invalid Codex hook payload" };
  }

  const payload = parsed.data;
  const hookEventName = hookEventOverride ?? payload.hook_event_name;
  if (!hookEventName || !isCodexHookEventName(hookEventName)) {
    return { kind: "ignored", reason: "Unsupported Codex hook event" };
  }
  const status = CODEX_HOOK_STATUS.get(hookEventName);
  if (!status) {
    return { kind: "ignored", reason: "Unsupported Codex hook event" };
  }

  const toolName = safeToolName(payload.tool_name);
  const taskTitle =
    options.promptPreview && hookEventName === "UserPromptSubmit"
      ? formatPromptPreviewTaskTitle(payload.prompt)
      : undefined;
  const event: AgentEventInput = {
    source: "codex",
    surface,
    status,
    title: hookEventName,
    ...(payload.session_id ? { sessionId: payload.session_id } : {}),
    ...(payload.cwd ? { projectPath: payload.cwd } : {}),
    ...(taskTitle ? { taskTitle } : {}),
    ...(status === "using_tool" && toolName
      ? { message: `Using tool: ${toolName}` }
      : {}),
  };

  return { kind: "event", event };
}
