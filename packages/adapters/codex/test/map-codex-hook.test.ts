import { describe, expect, it } from "vitest";

import {
  CODEX_HOOK_TOOL_NAME_LIMIT,
  ingestCodexHookJson,
  mapCodexHook,
} from "../src/index.js";

describe("Codex hook adapter", () => {
  it.each([
    ["SessionStart", "running"],
    ["UserPromptSubmit", "running"],
    ["PreToolUse", "using_tool"],
    ["PermissionRequest", "waiting_permission"],
    ["PostToolUse", "running"],
    ["Stop", "completed"],
  ] as const)("maps %s to %s", (hookEventName, status) => {
    expect(
      mapCodexHook({
        session_id: "codex-session",
        cwd: "/workspace/demo",
        hook_event_name: hookEventName,
        tool_name: "Bash",
      }),
    ).toEqual({
      kind: "event",
      event: {
        source: "codex",
        surface: "unknown",
        status,
        title: hookEventName,
        sessionId: "codex-session",
        projectPath: "/workspace/demo",
        ...(hookEventName === "PreToolUse"
          ? { message: "Using tool: Bash" }
          : {}),
      },
    });
  });

  it("ignores unsupported events", () => {
    expect(mapCodexHook({ hook_event_name: "PreCompact" })).toEqual({
      kind: "ignored",
      reason: "Unsupported Codex hook event",
    });
    expect(mapCodexHook({ session_id: "missing-event" })).toEqual({
      kind: "ignored",
      reason: "Unsupported Codex hook event",
    });
  });

  it("rejects malformed JSON and payloads", () => {
    expect(ingestCodexHookJson("{")).toEqual({
      kind: "invalid",
      reason: "Invalid Codex hook JSON",
    });
    expect(mapCodexHook("not-an-object")).toEqual({
      kind: "invalid",
      reason: "Invalid Codex hook payload",
    });
  });

  it("uses an explicit hook event over the stdin payload event", () => {
    expect(
      ingestCodexHookJson(
        JSON.stringify({
          session_id: "override-session",
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
        }),
        "Stop",
      ),
    ).toEqual({
      kind: "event",
      event: {
        source: "codex",
        surface: "unknown",
        status: "completed",
        title: "Stop",
        sessionId: "override-session",
      },
    });
  });

  it.each(["", "{", JSON.stringify({ session_id: 42 })])(
    "creates a best-effort event from an explicit hook when stdin is unusable",
    (json) => {
      expect(ingestCodexHookJson(json, "Stop")).toEqual({
        kind: "event",
        event: {
          source: "codex",
          surface: "unknown",
          status: "completed",
          title: "Stop",
        },
      });
    },
  );

  it("strips sensitive and unknown fields from normalized events", () => {
    const result = mapCodexHook({
      session_id: "safe-session",
      cwd: "/safe/path",
      hook_event_name: "Stop",
      prompt: "secret-prompt",
      transcript_path: "/secret/transcript",
      tool_input: { command: "secret-command" },
      tool_response: "secret-response",
      last_assistant_message: "secret-message",
      rawEvent: { secret: true },
    });

    expect(result.kind).toBe("event");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("rawEvent");
  });

  it("accepts an explicit desktop surface without changing event mapping", () => {
    expect(
      mapCodexHook({ hook_event_name: "Stop" }, undefined, "desktop"),
    ).toEqual({
      kind: "event",
      event: {
        source: "codex",
        surface: "desktop",
        status: "completed",
        title: "Stop",
      },
    });
  });

  it("bounds the only tool detail that can become a message", () => {
    const result = mapCodexHook({
      hook_event_name: "PreToolUse",
      tool_name: "x".repeat(CODEX_HOOK_TOOL_NAME_LIMIT + 20),
    });

    expect(result).toMatchObject({
      kind: "event",
      event: { status: "using_tool" },
    });
    if (result.kind === "event") {
      expect(result.event.message).toHaveLength(
        "Using tool: ".length + CODEX_HOOK_TOOL_NAME_LIMIT,
      );
      expect(result.event.message).toMatch(/…$/u);
    }
  });
});
