import {
  mapCopilotEvent,
  type CopilotAdapterResult,
} from "./map-copilot-event.js";

export function ingestCopilotHookJson(json: string): CopilotAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Copilot CLI hook JSON" };
  }

  return mapCopilotEvent(payload);
}
