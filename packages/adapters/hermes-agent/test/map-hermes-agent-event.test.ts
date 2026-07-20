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
    ["start", "running"],
    ["tool_use", "using_tool"],
    ["finish", "completed"],
    ["error", "failed"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "tool_use",
      tool_name: "run_command",
    });

    const normalized = normalizeAgentEvent(event);
    expect(normalized).toMatchObject({
      source: "hermes-agent",
      surface: "cli",
      status: "using_tool",
      sessionId: "hermes-agent-session",
      projectPath: "/tmp/hermes-agent-project",
      title: "tool_use",
      ...(normalized.message ? { message: normalized.message } : {}),
    });
  });

  it("never leaks raw parameters or transcripts", () => {
    const result = mapHermesAgentEvent({
      hook_event_name: "tool_use",
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
