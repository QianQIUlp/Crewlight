import {
  mapClaudeEvent,
  type ClaudeAdapterResult,
} from "./map-claude-event.js";

export function ingestClaudeHookJson(json: string): ClaudeAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Claude Code hook JSON" };
  }

  return mapClaudeEvent(payload);
}
