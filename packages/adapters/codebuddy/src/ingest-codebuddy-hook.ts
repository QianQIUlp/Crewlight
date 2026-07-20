import {
  mapCodebuddyEvent,
  type CodebuddyAdapterResult,
} from "./map-codebuddy-event.js";

export function ingestCodebuddyHookJson(json: string): CodebuddyAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Codebuddy hook JSON" };
  }

  return mapCodebuddyEvent(payload);
}
