import {
  mapKiroCliEvent,
  type KiroCliAdapterResult,
} from "./map-kiro-cli-event.js";

export function ingestKiroCliHookJson(json: string): KiroCliAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid KiroCli hook JSON" };
  }

  return mapKiroCliEvent(payload);
}
