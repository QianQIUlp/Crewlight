import {
  mapPiAgentEvent,
  type PiAgentAdapterResult,
} from "./map-pi-agent-event.js";

export function ingestPiAgentHookJson(json: string): PiAgentAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid PiAgent hook JSON" };
  }

  return mapPiAgentEvent(payload);
}
