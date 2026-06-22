import {
  mapCursorBridgeEvent,
  type CursorAdapterResult,
} from "./map-cursor-event.js";

export function ingestCursorBridgeJson(json: string): CursorAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Cursor bridge JSON" };
  }

  return mapCursorBridgeEvent(payload);
}
