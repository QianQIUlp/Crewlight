import {
  mapKimiCliEvent,
  type KimiCliAdapterResult,
} from "./map-kimi-cli-event.js";

export function ingestKimiCliHookJson(json: string): KimiCliAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid KimiCli hook JSON" };
  }

  return mapKimiCliEvent(payload);
}
