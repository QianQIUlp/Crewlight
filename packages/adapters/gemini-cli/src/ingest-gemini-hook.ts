import {
  mapGeminiEvent,
  type GeminiAdapterResult,
} from "./map-gemini-event.js";

export function ingestGeminiHookJson(json: string): GeminiAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Gemini CLI hook JSON" };
  }

  return mapGeminiEvent(payload);
}
