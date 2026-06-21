import { readFileSync } from "node:fs";

import { normalizeAgentEvent } from "@agentpulse/core";
import { describe, expect, it } from "vitest";

import { ingestClaudeHookJson, mapClaudeEvent } from "../src/index.js";

function eventFor(payload: Record<string, unknown>) {
  const result = mapClaudeEvent({
    session_id: "claude-session",
    cwd: "/tmp/claude-project",
    ...payload,
  });

  expect(result.kind).toBe("event");
  if (result.kind !== "event") {
    throw new Error("Expected mapped Claude event");
  }

  return result.event;
}

describe("Claude Code adapter", () => {
  it("normalizes a sanitized fixture without retaining private payload fields", () => {
    const fixture = readFileSync(
      new URL("./fixtures/stop.sanitized.json", import.meta.url),
      "utf8",
    );
    const result = ingestClaudeHookJson(fixture);

    expect(result.kind).toBe("event");
    if (result.kind !== "event") {
      throw new Error("Expected fixture to map");
    }

    const event = normalizeAgentEvent(result.event);
    expect(event).toMatchObject({
      source: "claude-code",
      surface: "cli",
      status: "completed",
      sessionId: "fixture-claude-session",
      projectPath: "/workspace/sanitized-project",
      title: "Stop",
      message: "Sanitized completion",
    });
    expect(JSON.stringify(event)).not.toContain("private-command-placeholder");
    expect(JSON.stringify(event)).not.toContain("private-secret-placeholder");
    expect(JSON.stringify(event)).not.toContain("transcript");
  });

  it.each([
    ["SessionStart", "running"],
    ["UserPromptSubmit", "running"],
    ["PreToolUse", "using_tool"],
    ["PostToolUse", "running"],
    ["PermissionRequest", "waiting_permission"],
    ["Stop", "completed"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(eventFor({ hook_event_name: hookEventName }).status).toBe(status);
  });

  it.each([
    ["permission_prompt", "waiting_permission"],
    ["idle_prompt", "waiting_input"],
  ] as const)("refines Notification(%s) to %s", (notificationType, status) => {
    expect(
      eventFor({
        hook_event_name: "Notification",
        notification_type: notificationType,
      }).status,
    ).toBe(status);
  });

  it("maps the official and compatibility StopFailure error fields", () => {
    expect(
      eventFor({
        hook_event_name: "StopFailure",
        error: "rate_limit",
        error_type: "server_error",
      }).status,
    ).toBe("rate_limited");
    expect(
      eventFor({
        hook_event_name: "StopFailure",
        error_type: "rate_limit",
      }).status,
    ).toBe("rate_limited");
    expect(
      eventFor({
        hook_event_name: "StopFailure",
        error: "server_error",
      }).status,
    ).toBe("failed");
  });

  it("maps session identity, project path, and safe descriptive fields", () => {
    const event = eventFor({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
    });

    expect(event).toMatchObject({
      source: "claude-code",
      surface: "cli",
      sessionId: "claude-session",
      projectPath: "/tmp/claude-project",
      title: "PreToolUse",
      message: "Using tool: Bash",
    });
  });

  it("derives a task title from UserPromptSubmit only when opted in", () => {
    const payload = {
      hook_event_name: "UserPromptSubmit",
      message: "private prompt",
      prompt: "  查看\nAGENTS.md  ",
      session_id: "prompt-session",
    };

    expect(mapClaudeEvent(payload)).toEqual({
      kind: "event",
      event: {
        source: "claude-code",
        surface: "cli",
        status: "running",
        title: "UserPromptSubmit",
        sessionId: "prompt-session",
      },
    });
    expect(mapClaudeEvent(payload, { promptPreview: true })).toEqual({
      kind: "event",
      event: {
        source: "claude-code",
        surface: "cli",
        status: "running",
        taskTitle: "查看 AGENTS.md",
        title: "UserPromptSubmit",
        sessionId: "prompt-session",
      },
    });
    expect(
      JSON.stringify(mapClaudeEvent(payload, { promptPreview: true })),
    ).not.toContain("private prompt");
  });

  it("does not use prompts for non-user-request events", () => {
    const result = mapClaudeEvent(
      {
        hook_event_name: "Stop",
        prompt: "private prompt",
      },
      { promptPreview: true },
    );

    expect(result.kind).toBe("event");
    expect(JSON.stringify(result)).not.toContain("private prompt");
    if (result.kind === "event") {
      expect(result.event).not.toHaveProperty("taskTitle");
      expect(result.event).not.toHaveProperty("prompt");
    }
  });

  it("does not include passthrough fields or raw payloads", () => {
    const result = mapClaudeEvent({
      hook_event_name: "Stop",
      rawEvent: { secret: "raw-secret" },
      transcript_path: "/private/transcript.jsonl",
      tool_input: { command: "private-command" },
      prompt: "private-prompt",
    });

    expect(result.kind).toBe("event");
    expect(JSON.stringify(result)).not.toContain("raw-secret");
    expect(JSON.stringify(result)).not.toContain("private-command");
    expect(JSON.stringify(result)).not.toContain("private-prompt");
    expect(JSON.stringify(result)).not.toContain("transcript");
  });

  it("ignores SessionEnd and unsupported events", () => {
    expect(mapClaudeEvent({ hook_event_name: "SessionEnd" }).kind).toBe(
      "ignored",
    );
    expect(mapClaudeEvent({ hook_event_name: "PostToolUseFailure" }).kind).toBe(
      "ignored",
    );
    expect(
      mapClaudeEvent({
        hook_event_name: "Notification",
        notification_type: "auth_success",
      }).kind,
    ).toBe("ignored");
  });

  it("safely rejects malformed JSON and invalid payloads", () => {
    expect(ingestClaudeHookJson("{").kind).toBe("invalid");
    expect(ingestClaudeHookJson('{"cwd":"/tmp"}').kind).toBe("invalid");
  });
});
