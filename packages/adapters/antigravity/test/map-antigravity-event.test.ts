import { resolve } from "node:path";

import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import {
  ingestAntigravityHookJson,
  mapAntigravityEvent,
} from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapAntigravityEvent({
    session_id: "antigravity-session",
    cwd: "/tmp/antigravity-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped Antigravity event");
  }

  return result.event;
}

describe("Antigravity adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["BeforeTool", "using_tool"],
    ["PreToolUse", "using_tool"],
    ["AfterTool", "running"],
    ["PostToolUse", "running"],
    ["Stop", "completed"],
    ["StopFailure", "failed"],
    ["SessionEnd", "idle"],
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
      source: "antigravity",
      surface: "cli",
      status: "using_tool",
      sessionId: "antigravity-session",
      projectPath: resolve("/tmp/antigravity-project"),
      title: "PreToolUse",
      message: "Using tool: run_command",
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapAntigravityEvent({
      hook_event_name: "PreToolUse",
      tool_name: "run_command",
      prompt: "find secret credentials",
      transcript: "some private dialog",
      raw_output: "keys keys keys",
      title: "secret platform title",
      message: "secret platform message",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      const eventJson = JSON.stringify(result.event);
      expect(eventJson).not.toContain("secret");
      expect(eventJson).not.toContain("dialog");
      expect(eventJson).not.toContain("keys");
      expect(eventJson).not.toContain("secret platform title");
      expect(eventJson).not.toContain("secret platform message");
      expect(result.event.title).toBe("PreToolUse");
    }
  });

  it("ignores unsupported events", () => {
    const result = mapAntigravityEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapAntigravityEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestAntigravityHookJson", () => {
    const result = ingestAntigravityHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
