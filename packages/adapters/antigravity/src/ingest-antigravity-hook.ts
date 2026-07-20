import {
  mapAntigravityEvent,
  type AntigravityAdapterResult,
} from "./map-antigravity-event.js";

export function ingestAntigravityHookJson(
  json: string,
): AntigravityAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Antigravity hook JSON" };
  }

  return mapAntigravityEvent(payload);
}
