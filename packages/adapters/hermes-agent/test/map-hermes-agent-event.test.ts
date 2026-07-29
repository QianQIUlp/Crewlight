import { resolve } from "node:path";

import { normalizeAgentEvent } from "@crewlight/core";
import { describe, expect, it } from "vitest";

import {
  ingestHermesAgentHookJson,
  mapHermesAgentEvent,
} from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapHermesAgentEvent({
    session_id: "hermes-agent-session",
    cwd: "/tmp/hermes-agent-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped HermesAgent event");
  }

  return result.event;
}

describe("HermesAgent adapter", () => {
  it.each([
    ["on_session_start", "running"],
    ["pre_llm_call", "running"],
    ["pre_tool_call", "using_tool"],
    ["post_tool_call", "running"],
    ["post_llm_call", "completed"],
    ["pre_approval_request", "waiting_permission"],
    ["post_approval_response", "running"],
    ["subagent_start", "using_tool"],
    ["subagent_stop", "running"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it.each([
    [{ completed: true, interrupted: false }, "idle"],
    [{ completed: false, interrupted: false }, "failed"],
    [{ completed: false, interrupted: true }, "idle"],
    [{}, "unknown"],
  ] as const)(
    "classifies on_session_end from safe outcome flags",
    (extra, status) => {
      expect(
        eventFor({ hook_event_name: "on_session_end", extra }).status,
      ).toBe(status);
    },
  );

  it("does not forward other on_session_end payload fields", () => {
    const event = eventFor({
      hook_event_name: "on_session_end",
      extra: {
        completed: false,
        interrupted: false,
        conversation_history: "private transcript",
      },
    });

    expect(event.status).toBe("failed");
    expect(JSON.stringify(event)).not.toContain("private transcript");
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "pre_tool_call",
      tool_name: "run_command",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "hermes-agent",
      surface: "cli",
      status: "using_tool",
      sessionId: "hermes-agent-session",
      projectPath: resolve("/tmp/hermes-agent-project"),
      title: "pre_tool_call",
      ...(normalized.message ? { message: normalized.message } : {}),
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapHermesAgentEvent({
      hook_event_name: "pre_tool_call",
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
    const result = mapHermesAgentEvent({
      hook_event_name: "UnknownEventName",
    });
    expect(result.kind).toBe("ignored");
  });

  it("rejects malformed payloads", () => {
    const result = mapHermesAgentEvent({
      hook_event_name: 123,
    });
    expect(result.kind).toBe("invalid");
  });

  it("handles malformed JSON in ingestHermesAgentHookJson", () => {
    const result = ingestHermesAgentHookJson("{invalid-json}");
    expect(result.kind).toBe("invalid");
  });
});
