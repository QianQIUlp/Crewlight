import {
  mapReasonixCliEvent,
  type ReasonixCliAdapterResult,
} from "./map-reasonix-cli-event.js";

export function ingestReasonixCliHookJson(
  json: string,
): ReasonixCliAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid ReasonixCli hook JSON" };
  }

  return mapReasonixCliEvent(payload);
}
