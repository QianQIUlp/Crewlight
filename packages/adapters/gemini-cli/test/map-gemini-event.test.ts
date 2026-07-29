import { resolve } from "node:path";

import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestGeminiHookJson, mapGeminiEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapGeminiEvent({
    session_id: "gemini-session",
    cwd: "/tmp/gemini-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped Gemini event");
  }

  return result.event;
}

describe("Gemini CLI adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["BeforeAgent", "running"],
    ["AfterAgent", "completed"],
    ["BeforeTool", "using_tool"],
    ["AfterTool", "running"],
    ["PreCompress", "running"],
    ["SessionEnd", "idle"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it("maps the documented ToolPermission notification", () => {
    expect(
      eventFor({
        hook_event_name: "Notification",
        notification_type: "ToolPermission",
      }).status,
    ).toBe("waiting_permission");
  });

  it("ignores undocumented notification types", () => {
    expect(
      mapGeminiEvent({
        hook_event_name: "Notification",
        notification_type: "other_prompt",
      }).kind,
    ).toBe("ignored");
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "BeforeTool",
      tool_name: "glob",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "gemini-cli",
      surface: "cli",
      status: "using_tool",
      sessionId: "gemini-session",
      projectPath: resolve("/tmp/gemini-project"),
      title: "BeforeTool",
      message: "Using tool: glob",
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapGeminiEvent({
      hook_event_name: "BeforeTool",
      tool_name: "glob",
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

  it("ignores unsupported events", () => {
    const result = mapGeminiEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapGeminiEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestGeminiHookJson", () => {
    const result = ingestGeminiHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
