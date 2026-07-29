import { resolve } from "node:path";

import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestCodebuddyHookJson, mapCodebuddyEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapCodebuddyEvent({
    session_id: "codebuddy-session",
    cwd: "/tmp/codebuddy-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped Codebuddy event");
  }

  return result.event;
}

describe("Codebuddy adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["UserPromptSubmit", "running"],
    ["PreToolUse", "using_tool"],
    ["PostToolUse", "running"],
    ["PostToolUseFailure", "running"],
    ["PermissionRequest", "waiting_permission"],
    ["Stop", "completed"],
    ["StopFailure", "failed"],
    ["SessionEnd", "idle"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it("does not forward arbitrary platform messages or titles", () => {
    const result = mapCodebuddyEvent({
      hook_event_name: "StopFailure",
      message: "private platform details",
      title: "private platform title",
    });

    expect(result.kind).toBe("event");
    expect(JSON.stringify(result)).not.toContain("private platform");
  });

  it("maps only permission notifications to attention", () => {
    expect(
      eventFor({
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
      }).status,
    ).toBe("waiting_permission");
    expect(
      mapCodebuddyEvent({
        hook_event_name: "Notification",
        notification_type: "other",
      }).kind,
    ).toBe("ignored");
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "PreToolUse",
      tool_name: "run_command",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "codebuddy",
      surface: "cli",
      status: "using_tool",
      sessionId: "codebuddy-session",
      projectPath: resolve("/tmp/codebuddy-project"),
      title: "PreToolUse",
      ...(normalized.message ? { message: normalized.message } : {}),
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapCodebuddyEvent({
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
    const result = mapCodebuddyEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapCodebuddyEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestCodebuddyHookJson", () => {
    const result = ingestCodebuddyHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
