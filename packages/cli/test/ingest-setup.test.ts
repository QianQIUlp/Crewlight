import type {
  AgentEvent,
  AgentEventInput,
  AgentSession,
} from "@agentpulse/core";
import type { IngestResult } from "@agentpulse/daemon";
import { describe, expect, it } from "vitest";

import type { AgentPulseClient } from "../src/daemon-client.js";
import { executeIngestCommand } from "../src/commands/ingest.js";
import {
  CLAUDE_CODE_SETUP_SNIPPET,
  CODEX_SETUP_SNIPPET,
  executeSetupCommand,
} from "../src/commands/setup.js";
import type { CommandIo } from "../src/commands/types.js";

function captureIo() {
  const output: string[] = [];
  const warnings: string[] = [];
  const io: CommandIo = {
    write: (message) => output.push(message),
    warn: (message) => warnings.push(message),
  };
  return { io, output, warnings };
}

function captureClient() {
  const events: AgentEventInput[] = [];
  const client: AgentPulseClient = {
    emit: async (event): Promise<IngestResult> => {
      events.push(event);
      return {
        event: event as AgentEvent,
        session: {} as AgentSession,
      };
    },
    sessions: async () => [],
  };
  return { client, events };
}

describe("platform ingest commands", () => {
  it("reads a Claude Code hook from stdin and sends it silently", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["claude-code"],
      target.client,
      capture.io,
      async () =>
        JSON.stringify({
          session_id: "claude-cli",
          cwd: "/tmp/demo",
          hook_event_name: "Stop",
          last_assistant_message: "Done",
        }),
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([
      expect.objectContaining({
        source: "claude-code",
        status: "completed",
        sessionId: "claude-cli",
      }),
    ]);
    expect(capture.output).toEqual([]);
    expect(capture.warnings).toEqual([]);
  });

  it("accepts Codex JSON from argv", async () => {
    const capture = captureIo();
    const target = captureClient();

    await executeIngestCommand(
      [
        "codex",
        JSON.stringify({
          type: "agent-turn-complete",
          "thread-id": "codex-argv",
        }),
      ],
      target.client,
      capture.io,
      async () => {
        throw new Error("stdin should not be read");
      },
    );

    expect(target.events[0]).toMatchObject({
      source: "codex",
      status: "completed",
      sessionId: "codex-argv",
    });
  });

  it("falls back to stdin for Codex JSON", async () => {
    const capture = captureIo();
    const target = captureClient();

    await executeIngestCommand(["codex"], target.client, capture.io, async () =>
      JSON.stringify({
        type: "agent-turn-complete",
        "thread-id": "codex-stdin",
      }),
    );

    expect(target.events[0]?.sessionId).toBe("codex-stdin");
  });

  it("warns and returns zero for ignored or invalid input", async () => {
    const capture = captureIo();
    const target = captureClient();

    const ignoredCode = await executeIngestCommand(
      ["claude-code"],
      target.client,
      capture.io,
      async () => JSON.stringify({ hook_event_name: "SessionEnd" }),
    );
    const invalidCode = await executeIngestCommand(
      ["codex", "{"],
      target.client,
      capture.io,
      async () => "",
    );

    expect(ignoredCode).toBe(0);
    expect(invalidCode).toBe(0);
    expect(target.events).toEqual([]);
    expect(capture.warnings).toHaveLength(2);
    expect(capture.warnings.join("\n")).not.toContain("{");
  });

  it("does not block the platform when the daemon is unavailable", async () => {
    const capture = captureIo();
    const client: AgentPulseClient = {
      emit: async () => {
        throw new Error("connection detail should not leak");
      },
      sessions: async () => [],
    };

    const code = await executeIngestCommand(
      [
        "codex",
        JSON.stringify({
          type: "agent-turn-complete",
          "thread-id": "codex-offline",
        }),
      ],
      client,
      capture.io,
      async () => "",
    );

    expect(code).toBe(0);
    expect(capture.warnings).toEqual([
      "AgentPulse ingest warning: unable to deliver event to the AgentPulse daemon",
    ]);
    expect(capture.warnings.join("\n")).not.toContain("connection detail");
  });

  it("does not block the platform when stdin cannot be read", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["claude-code"],
      target.client,
      capture.io,
      async () => {
        throw new Error("stdin detail should not leak");
      },
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([]);
    expect(capture.warnings).toEqual([
      "AgentPulse ingest warning: unable to read platform input",
    ]);
    expect(capture.warnings.join("\n")).not.toContain("stdin detail");
  });
});

describe("setup snippet commands", () => {
  it("prints the Claude Code snippet without SessionEnd", () => {
    const capture = captureIo();

    expect(executeSetupCommand(["claude-code", "--print"], capture.io)).toBe(0);
    expect(capture.output).toEqual([CLAUDE_CODE_SETUP_SNIPPET]);
    expect(CLAUDE_CODE_SETUP_SNIPPET).toContain("UserPromptSubmit");
    expect(CLAUDE_CODE_SETUP_SNIPPET).not.toContain("SessionEnd");
  });

  it("prints the Codex notify snippet", () => {
    const capture = captureIo();

    expect(executeSetupCommand(["codex", "--print"], capture.io)).toBe(0);
    expect(capture.output).toEqual([CODEX_SETUP_SNIPPET]);
  });
});
