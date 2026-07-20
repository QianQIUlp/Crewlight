import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestCopilotHookJson, mapCopilotEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapCopilotEvent({
    session_id: "copilot-session",
    cwd: "/tmp/copilot-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped Copilot event");
  }

  return result.event;
}

describe("Copilot CLI adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["PreToolUse", "using_tool"],
    ["PostToolUse", "running"],
    ["Stop", "completed"],
    ["StopFailure", "failed"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it.each([
    ["permission_prompt", "waiting_permission"],
    ["other_prompt", "waiting_input"],
  ] as const)("refines Notification(%s) to %s", (notificationType, status) => {
    expect(
      eventFor({
        hook_event_name: "Notification",
        notification_type: notificationType,
      }).status,
    ).toBe(status);
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "PreToolUse",
      tool_name: "read_file",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "copilot-cli",
      surface: "cli",
      status: "using_tool",
      sessionId: "copilot-session",
      projectPath: "/tmp/copilot-project",
      title: "PreToolUse",
      message: "Using tool: read_file",
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapCopilotEvent({
      hook_event_name: "PreToolUse",
      tool_name: "read_file",
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
    const result = mapCopilotEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapCopilotEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestCopilotHookJson", () => {
    const result = ingestCopilotHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
