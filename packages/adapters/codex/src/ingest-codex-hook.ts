import type { AgentSurface } from "@agentpulse/core";

import type { CodexAdapterResult } from "./map-codex-notification.js";
import { mapCodexHook } from "./map-codex-hook.js";

export function ingestCodexHookJson(
  json: string,
  hookEventOverride?: string,
  surface: AgentSurface = "unknown",
): CodexAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    if (hookEventOverride !== undefined) {
      return mapCodexHook({}, hookEventOverride, surface);
    }
    return { kind: "invalid", reason: "Invalid Codex hook JSON" };
  }

  const result = mapCodexHook(payload, hookEventOverride, surface);
  if (result.kind === "invalid" && hookEventOverride !== undefined) {
    return mapCodexHook({}, hookEventOverride, surface);
  }
  return result;
}
