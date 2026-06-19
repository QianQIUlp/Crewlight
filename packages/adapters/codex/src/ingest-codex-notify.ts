import {
  mapCodexNotification,
  type CodexAdapterResult,
} from "./map-codex-notification.js";

export function ingestCodexNotifyJson(json: string): CodexAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    return { kind: "invalid", reason: "Invalid Codex notify JSON" };
  }

  return mapCodexNotification(payload);
}
