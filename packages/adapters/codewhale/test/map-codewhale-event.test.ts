import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import { ingestCodewhaleHookJson, mapCodewhaleEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapCodewhaleEvent({
    session_id: "codewhale-session",
    workspace: "/tmp/codewhale-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped Codewhale event");
  }

  return result.event;
}

describe("Codewhale adapter", () => {
  it.each([
    ["session_start", "running"],
    ["message_submit", "running"],
    ["tool_call_before", "using_tool"],
    ["tool_call_after", "running"],
    ["turn_end", "completed"],
    ["on_error", "failed"],
    ["session_end", "completed"],
    ["subagent_spawn", "using_tool"],
    ["subagent_complete", "running"],
  ] as const)("maps %s to %s", (eventName, status) => {
    expect(eventFor({ event: eventName }).status).toBe(status);
  });

  it("uses a failed turn_end status when CodeWhale reports failure", () => {
    expect(eventFor({ event: "turn_end", status: "failed" }).status).toBe(
      "failed",
    );
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      event: "tool_call_before",
      tool_name: "run_command",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "codewhale",
      surface: "cli",
      status: "using_tool",
      sessionId: "codewhale-session",
      projectPath: "/tmp/codewhale-project",
      title: "tool_call_before",
      ...(normalized.message ? { message: normalized.message } : {}),
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapCodewhaleEvent({
      event: "tool_call_before",
      workspace: "/tmp/codewhale-project",
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

  it("ignores unsupported events", () => {
    const result = mapCodewhaleEvent({
      event: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapCodewhaleEvent({
      event: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestCodewhaleHookJson", () => {
    const result = ingestCodewhaleHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
