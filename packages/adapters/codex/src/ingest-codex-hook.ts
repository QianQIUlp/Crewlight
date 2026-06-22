import type { AgentSurface } from "@crewlight/core";

import type { CodexAdapterResult } from "./map-codex-notification.js";
import {
  mapCodexHook,
  type CodexHookAdapterOptions,
} from "./map-codex-hook.js";

export function ingestCodexHookJson(
  json: string,
  hookEventOverride?: string,
  surface: AgentSurface = "unknown",
  options: CodexHookAdapterOptions = {},
): CodexAdapterResult {
  let payload: unknown;

  try {
    payload = JSON.parse(json);
  } catch {
    if (hookEventOverride !== undefined) {
      return mapCodexHook({}, hookEventOverride, surface, options);
    }
    return { kind: "invalid", reason: "Invalid Codex hook JSON" };
  }

  const result = mapCodexHook(payload, hookEventOverride, surface, options);
  if (result.kind === "invalid" && hookEventOverride !== undefined) {
    return mapCodexHook({}, hookEventOverride, surface, options);
  }
  return result;
}
