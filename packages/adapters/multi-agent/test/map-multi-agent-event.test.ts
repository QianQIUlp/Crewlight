import { describe, expect, it } from "vitest";
import {
  ingestMultiAgentHookJson,
  mapMultiAgentEvent,
} from "../src/map-multi-agent-event.js";

describe("multi-agent event mapper", () => {
  it("successfully maps valid events", () => {
    const result = mapMultiAgentEvent("gemini-cli", {
      hook_event_name: "SessionStart",
      session_id: "test-session-123",
      cwd: "/home/user/project",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event).toEqual({
        source: "gemini-cli",
        surface: "cli",
        status: "running",
        sessionId: "test-session-123",
        projectPath: "/home/user/project",
        title: "SessionStart",
      });
    }
  });

  it("translates tool use status", () => {
    const result = mapMultiAgentEvent("copilot-cli", {
      hook_event_name: "PreToolUse",
      session_id: "sess-abc",
      tool_name: "file_write",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.status).toBe("using_tool");
      expect(result.event.message).toBe("Using tool: file_write");
    }
  });

  it("handles lowercase events", () => {
    const result = mapMultiAgentEvent("reasonix-cli", {
      hook_event_name: "permission",
      session_id: "sess-xyz",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      expect(result.event.status).toBe("waiting_permission");
    }
  });

  it("rejects invalid payload structures", () => {
    const result = mapMultiAgentEvent("qwen-code", {
      wrong_field: "something",
    });

    expect(result.kind).toBe("invalid");
  });

  it("ignores unsupported event names instead of inventing running state", () => {
    const result = mapMultiAgentEvent("opencode-compat", {
      hook_event_name: "TotallyUnknown",
      session_id: "unknown-event-session",
    });

    expect(result).toEqual({
      kind: "ignored",
      reason: "Unsupported opencode-compat hook event",
    });
  });

  it("prevents prompt/transcript details leakage", () => {
    const result = mapMultiAgentEvent("gemini-cli", {
      hook_event_name: "UserPromptSubmit",
      session_id: "sess-123",
      prompt: "secret-prompt-here",
      transcript: "secret-transcript-here",
      title: "secret-title-here",
      message: "secret-message-here",
    });

    expect(result.kind).toBe("event");
    if (result.kind === "event") {
      const serialized = JSON.stringify(result.event);
      expect(serialized).not.toContain("secret-prompt-here");
      expect(serialized).not.toContain("secret-transcript-here");
      expect(serialized).not.toContain("secret-title-here");
      expect(serialized).not.toContain("secret-message-here");
      expect(result.event.title).toBe("UserPromptSubmit");
    }
  });

  it("does not echo malformed JSON input in invalid reasons", () => {
    const result = ingestMultiAgentHookJson(
      "opencode-compat",
      "secret-token-is-not-json",
    );

    expect(result.kind).toBe("invalid");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
