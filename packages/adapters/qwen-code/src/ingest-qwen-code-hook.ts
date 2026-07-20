import {
  mapQwenCodeEvent,
  type QwenCodeAdapterResult,
} from "./map-qwen-code-event.js";

export function ingestQwenCodeHookJson(json: string): QwenCodeAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid QwenCode hook JSON" };
  }

  return mapQwenCodeEvent(payload);
}
