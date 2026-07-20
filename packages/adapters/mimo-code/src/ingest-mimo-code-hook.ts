import {
  mapMimoCodeEvent,
  type MimoCodeAdapterResult,
} from "./map-mimo-code-event.js";

export function ingestMimoCodeHookJson(json: string): MimoCodeAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid MimoCode hook JSON" };
  }

  return mapMimoCodeEvent(payload);
}
