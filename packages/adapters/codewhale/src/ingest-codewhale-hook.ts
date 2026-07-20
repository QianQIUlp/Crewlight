import {
  mapCodewhaleEvent,
  type CodewhaleAdapterResult,
} from "./map-codewhale-event.js";

export function ingestCodewhaleHookJson(json: string): CodewhaleAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Codewhale hook JSON" };
  }

  return mapCodewhaleEvent(payload);
}
