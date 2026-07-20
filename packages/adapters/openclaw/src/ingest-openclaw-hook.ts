import {
  mapOpenclawEvent,
  type OpenclawAdapterResult,
} from "./map-openclaw-event.js";

export function ingestOpenclawHookJson(json: string): OpenclawAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Openclaw hook JSON" };
  }

  return mapOpenclawEvent(payload);
}
