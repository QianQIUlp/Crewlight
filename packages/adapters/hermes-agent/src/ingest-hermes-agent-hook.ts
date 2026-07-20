import {
  mapHermesAgentEvent,
  type HermesAgentAdapterResult,
} from "./map-hermes-agent-event.js";

export function ingestHermesAgentHookJson(
  json: string,
): HermesAgentAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid HermesAgent hook JSON" };
  }

  return mapHermesAgentEvent(payload);
}
