import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestMimoCodeHookJson, mapMimoCodeEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapMimoCodeEvent({
    session_id: "mimo-code-session",
    cwd: "/tmp/mimo-code-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped MimoCode event");
  }

  return result.event;
}

describe("MimoCode adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["PreToolUse", "using_tool"],
    ["PostToolUse", "running"],
    ["Stop", "completed"],
    ["StopFailure", "failed"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "PreToolUse",
      tool_name: "run_command",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "mimo-code",
      surface: "cli",
      status: "using_tool",
      sessionId: "mimo-code-session",
      projectPath: "/tmp/mimo-code-project",
      title: "PreToolUse",
      ...(normalized.message ? { message: normalized.message } : {}),
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapMimoCodeEvent({
      hook_event_name: "PreToolUse",
      tool_name: "run_command",
      prompt: "find secret credentials",
      transcript: "some private dialog",
      raw_output: "keys keys keys",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      const eventJson = JSON.stringify(result.event);
      expect(eventJson).not.toContain("secret");
      expect(eventJson).not.toContain("dialog");
      expect(eventJson).not.toContain("keys");
    }
  });

  it("ignores unsupported events", () => {
    const result = mapMimoCodeEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapMimoCodeEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestMimoCodeHookJson", () => {
    const result = ingestMimoCodeHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
