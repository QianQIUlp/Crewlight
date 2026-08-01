import { isAbsolute, join } from "node:path";

import { describe, expect, it } from "vitest";

import { mapCodexJsonlLine } from "../src/map-codex-jsonl.js";

const now = Date.parse("2026-08-01T08:00:00.000Z");
const options = { fallbackTimestamp: now - 1_000, now };
const turnId = "019fbc6d-2aa2-7f21-94cd-7774f0ea9351";

function line(type: string, payload: Record<string, unknown>) {
  return JSON.stringify({
    type,
    timestamp: "2026-08-01T07:59:59.000Z",
    payload,
  });
}

describe("Codex JSONL mapping", () => {
  it.each([
    ["event_msg", "task_started", "running"],
    ["event_msg", "guardian_assessment", "using_tool"],
    ["event_msg", "task_complete", "completed"],
    ["event_msg", "turn_aborted", "idle"],
    ["event_msg", "stream_error", "failed"],
    ["event_msg", "rate_limited", "rate_limited"],
    ["response_item", "function_call", "using_tool"],
    ["response_item", "custom_tool_call", "using_tool"],
    ["response_item", "function_call_output", "running"],
    ["response_item", "reasoning", "running"],
  ] as const)("maps %s:%s to %s", (type, subtype, expected) => {
    expect(mapCodexJsonlLine(line(type, { type: subtype }), options)).toEqual({
      status: expected,
      timestamp: now - 1_000,
    });
  });

  it("recognizes the explicit request_user_input tool without exposing its payload", () => {
    const mapped = mapCodexJsonlLine(
      line("response_item", {
        type: "custom_tool_call",
        name: "request_user_input",
        arguments: "PRIVATE-QUESTION-AND-CHOICES",
      }),
      options,
    );
    expect(mapped).toEqual({ status: "waiting_input", timestamp: now - 1_000 });
    expect(JSON.stringify(mapped)).not.toContain(
      "PRIVATE-QUESTION-AND-CHOICES",
    );
  });

  it("allowlists a UUID turn identity only for mapped lifecycle records", () => {
    expect(
      mapCodexJsonlLine(
        line("event_msg", {
          type: "task_complete",
          turn_id: turnId,
          last_agent_message: "PRIVATE-ASSISTANT-MESSAGE",
        }),
        options,
      ),
    ).toEqual({
      status: "completed",
      timestamp: now - 1_000,
      turnId,
    });
    expect(
      mapCodexJsonlLine(
        line("event_msg", {
          type: "task_complete",
          turn_id: "not-a-safe-codex-turn-id",
        }),
        options,
      ),
    ).toEqual({ status: "completed", timestamp: now - 1_000 });
  });

  it("allowlists only project location and known surface metadata", () => {
    const cwd = join(process.cwd(), "Crewlight fixture");
    expect(isAbsolute(cwd)).toBe(true);
    expect(
      mapCodexJsonlLine(
        line("session_meta", {
          type: "metadata",
          id: "platform-session-secret",
          cwd,
          originator: "Codex Desktop",
          base_instructions: "do-not-forward-instructions",
          dynamic_tools: [{ command: "do-not-forward-command" }],
        }),
        options,
      ),
    ).toEqual({ projectPath: cwd });
  });

  it("never returns prompt, assistant, tool input, tool output, or raw data", () => {
    const secret = "PRIVATE-PROMPT-TOOL-PAYLOAD";
    const records = [
      line("event_msg", { type: "user_message", message: secret }),
      line("event_msg", { type: "agent_message", message: secret }),
      line("response_item", {
        type: "function_call",
        name: "shell_command",
        arguments: secret,
      }),
      line("response_item", {
        type: "function_call_output",
        output: secret,
      }),
    ];

    const mapped = records.map((record) => mapCodexJsonlLine(record, options));
    expect(mapped.map((record) => record?.status)).toEqual([
      "running",
      "running",
      "using_tool",
      "running",
    ]);
    expect(JSON.stringify(mapped)).not.toContain(secret);
    for (const record of mapped) {
      expect(record).not.toHaveProperty("payload");
      expect(record).not.toHaveProperty("message");
      expect(record).not.toHaveProperty("rawEvent");
    }
  });

  it("ignores malformed, unknown, and unsafe metadata", () => {
    expect(mapCodexJsonlLine("{", options)).toBeUndefined();
    expect(
      mapCodexJsonlLine(line("future_record", {}), options),
    ).toBeUndefined();
    expect(
      mapCodexJsonlLine(
        line("session_meta", {
          cwd: "relative/private-project",
          originator: "untrusted-originator",
        }),
        options,
      ),
    ).toBeUndefined();
  });
});
