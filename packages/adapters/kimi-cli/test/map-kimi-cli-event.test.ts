import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestKimiCliHookJson, mapKimiCliEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapKimiCliEvent({
    session_id: "kimi-cli-session",
    cwd: "/tmp/kimi-cli-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped KimiCli event");
  }

  return result.event;
}

describe("KimiCli adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["BeforeTool", "using_tool"],
    ["AfterTool", "running"],
    ["Stop", "completed"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "BeforeTool",
      tool_name: "run_command",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "kimi-cli",
      surface: "cli",
      status: "using_tool",
      sessionId: "kimi-cli-session",
      projectPath: "/tmp/kimi-cli-project",
      title: "BeforeTool",
      ...(normalized.message ? { message: normalized.message } : {}),
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapKimiCliEvent({
      hook_event_name: "BeforeTool",
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
    const result = mapKimiCliEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapKimiCliEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestKimiCliHookJson", () => {
    const result = ingestKimiCliHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
