import {
  mapClaudeEvent,
  type ClaudeAdapterOptions,
  type ClaudeAdapterResult,
} from "./map-claude-event.js";

export function ingestClaudeHookJson(
  json: string,
  options: ClaudeAdapterOptions = {},
): ClaudeAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Claude Code hook JSON" };
  }

  return mapClaudeEvent(payload, options);
}
