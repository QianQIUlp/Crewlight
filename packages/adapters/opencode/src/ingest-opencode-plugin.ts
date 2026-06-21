import {
  mapOpenCodeEvent,
  type OpenCodeAdapterResult,
} from "./map-opencode-event.js";

export function ingestOpenCodePluginJson(
  json: string,
  eventOverride?: string,
): OpenCodeAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    if (eventOverride !== undefined) {
      return mapOpenCodeEvent({}, eventOverride);
    }
    return { kind: "invalid", reason: "Invalid OpenCode plugin JSON" };
  }

  const result = mapOpenCodeEvent(payload, eventOverride);
  if (result.kind === "invalid" && eventOverride !== undefined) {
    return mapOpenCodeEvent({}, eventOverride);
  }
  return result;
}
