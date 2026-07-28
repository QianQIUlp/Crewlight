import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestQwenCodeHookJson, mapQwenCodeEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapQwenCodeEvent({
    session_id: "qwen-code-session",
    cwd: "/tmp/qwen-code-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped QwenCode event");
  }

  return result.event;
}

describe("QwenCode adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["UserPromptSubmit", "running"],
    ["PreToolUse", "using_tool"],
    ["PostToolUse", "running"],
    ["PostToolUseFailure", "running"],
    ["PermissionRequest", "waiting_permission"],
    ["Stop", "completed"],
    ["SessionEnd", "idle"],
    ["StopFailure", "failed"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it("distinguishes rate limits from other turn failures", () => {
    expect(
      eventFor({ hook_event_name: "StopFailure", error: "rate_limit" }).status,
    ).toBe("rate_limited");
    expect(
      eventFor({
        hook_event_name: "StopFailure",
        error: "authentication_failed",
      }).status,
    ).toBe("failed");
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "PreToolUse",
      tool_name: "run_command",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "qwen-code",
      surface: "cli",
      status: "using_tool",
      sessionId: "qwen-code-session",
      projectPath: "/tmp/qwen-code-project",
      title: "PreToolUse",
      ...(normalized.message ? { message: normalized.message } : {}),
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapQwenCodeEvent({
      hook_event_name: "PreToolUse",
      tool_name: "run_command",
      prompt: "find secret credentials",
      transcript: "some private dialog",
      raw_output: "keys keys keys",
      message: "secret platform message",
      title: "secret platform title",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      const eventJson = JSON.stringify(result.event);
      expect(eventJson).not.toContain("secret");
      expect(eventJson).not.toContain("dialog");
      expect(eventJson).not.toContain("keys");
    }
  });

  it.each([
    ["permission_prompt", "waiting_permission"],
    ["idle_prompt", "waiting_input"],
  ] as const)("maps Notification(%s) to %s", (notificationType, status) => {
    expect(
      eventFor({
        hook_event_name: "Notification",
        notification_type: notificationType,
      }).status,
    ).toBe(status);
  });

  it("ignores notifications that do not require attention", () => {
    expect(
      mapQwenCodeEvent({
        hook_event_name: "Notification",
        notification_type: "auth_success",
      }).kind,
    ).toBe("ignored");
  });

  it("ignores unsupported events", () => {
    const result = mapQwenCodeEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapQwenCodeEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestQwenCodeHookJson", () => {
    const result = ingestQwenCodeHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
