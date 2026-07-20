import {
  mapQoderworkEvent,
  type QoderworkAdapterResult,
} from "./map-qoderwork-event.js";

export function ingestQoderworkHookJson(json: string): QoderworkAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Qoderwork hook JSON" };
  }

  return mapQoderworkEvent(payload);
}
