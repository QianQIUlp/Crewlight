import { isAbsolute } from "node:path";

import { AGENT_PATH_MAX_LENGTH, type AgentStatus } from "@crewlight/core";

const UNSAFE_IDENTITY_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const CODEX_TURN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface CodexJsonlLineOptions {
  fallbackTimestamp: number;
  now: number;
}

export interface CodexJsonlLineResult {
  projectPath?: string;
  status?: AgentStatus;
  timestamp?: number;
  turnId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeTimestamp(value: unknown, fallback: number, now: number): number {
  const parsed =
    typeof value === "string"
      ? Date.parse(value)
      : typeof value === "number"
        ? value
        : Number.NaN;
  const resolved = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  return Math.min(Math.trunc(resolved), Math.trunc(now));
}

function safeProjectPath(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > AGENT_PATH_MAX_LENGTH ||
    value.includes("\0") ||
    UNSAFE_IDENTITY_CHARACTERS.test(value) ||
    !isAbsolute(value)
  ) {
    return undefined;
  }
  return value;
}

function statusFromRecord(
  record: Record<string, unknown>,
): AgentStatus | undefined {
  const type = typeof record.type === "string" ? record.type : undefined;
  const payload = isRecord(record.payload) ? record.payload : undefined;
  const subtype =
    payload && typeof payload.type === "string" ? payload.type : undefined;

  if (type === "compacted") {
    return "running";
  }
  if (type === "error") {
    return "failed";
  }
  if (type === "event_msg") {
    switch (subtype) {
      case "task_started":
      case "user_message":
      case "agent_message":
      case "agent_reasoning":
      case "context_compacted":
      case "exec_command_end":
      case "patch_apply_end":
      case "mcp_tool_call_end":
      case "web_search_end":
        return "running";
      case "exec_command_begin":
      case "patch_apply_begin":
      case "mcp_tool_call_begin":
      case "web_search_begin":
      case "guardian_assessment":
        return "using_tool";
      case "task_complete":
        return "completed";
      case "turn_aborted":
        return "idle";
      case "rate_limit":
      case "rate_limited":
        return "rate_limited";
      case "error":
      case "stream_error":
        return "failed";
      default:
        return undefined;
    }
  }
  if (type === "response_item") {
    if (
      (subtype === "function_call" || subtype === "custom_tool_call") &&
      payload?.name === "request_user_input"
    ) {
      return "waiting_input";
    }
    switch (subtype) {
      case "function_call":
      case "custom_tool_call":
      case "web_search_call":
      case "tool_search_call":
        return "using_tool";
      case "function_call_output":
      case "custom_tool_call_output":
      case "tool_search_output":
      case "reasoning":
      case "agent_message":
      case "message":
        return "running";
      default:
        return undefined;
    }
  }
  return undefined;
}

export function mapCodexJsonlLine(
  line: string,
  options: CodexJsonlLineOptions,
): CodexJsonlLineResult | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const result: CodexJsonlLineResult = {};
  if (value.type === "session_meta" && isRecord(value.payload)) {
    const projectPath = safeProjectPath(value.payload.cwd);
    if (projectPath) {
      result.projectPath = projectPath;
    }
  }

  const status = statusFromRecord(value);
  if (status) {
    result.status = status;
    result.timestamp = safeTimestamp(
      value.timestamp,
      options.fallbackTimestamp,
      options.now,
    );
    const payload = isRecord(value.payload) ? value.payload : undefined;
    if (
      value.type === "event_msg" &&
      typeof payload?.turn_id === "string" &&
      CODEX_TURN_ID_PATTERN.test(payload.turn_id)
    ) {
      result.turnId = payload.turn_id;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
