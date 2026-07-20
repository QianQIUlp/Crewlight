import { mapQoderEvent, type QoderAdapterResult } from "./map-qoder-event.js";

export function ingestQoderHookJson(json: string): QoderAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Qoder hook JSON" };
  }

  return mapQoderEvent(payload);
}
