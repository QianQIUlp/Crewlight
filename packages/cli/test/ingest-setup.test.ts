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
  createSetupSnippets,
  executeSetupCommand,
  renderHookCommand,
  resolveAgentPulseCommand,
  type SetupRuntime,
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

function setupRuntime(overrides: Partial<SetupRuntime> = {}): SetupRuntime {
  return {
    isSea: () => false,
    execPath: "/usr/local/bin/node",
    entryPath: "/workspace/AgentPulse/packages/cli/dist/index.js",
    platform: "linux",
    ...overrides,
  };
}

function expectSilentCodexHook(capture: ReturnType<typeof captureIo>): void {
  expect(capture.output).toEqual([]);
  expect(capture.warnings).toEqual([]);
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
    expect(capture.output).toEqual([]);
    expect(capture.warnings).toEqual([]);
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

  it("keeps Stop stdout and stderr empty without leaking sensitive fields", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["codex-hook"],
      target.client,
      capture.io,
      async () =>
        JSON.stringify({
          session_id: "codex-Stop",
          cwd: "/tmp/demo",
          hook_event_name: "Stop",
          prompt: "secret prompt",
          tool_input: { command: "secret command" },
          tool_response: "secret response",
          transcript_path: "/tmp/secret-transcript",
          rawEvent: { secret: true },
        }),
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([
      {
        source: "codex",
        surface: "cli",
        status: "completed",
        title: "Stop",
        sessionId: "codex-Stop",
        projectPath: "/tmp/demo",
      },
    ]);
    expect(JSON.stringify(target.events)).not.toContain("secret");
    expect(JSON.stringify(capture)).not.toContain("secret");
    expectSilentCodexHook(capture);
  });

  it.each([
    ["SessionStart", "running", undefined],
    ["UserPromptSubmit", "running", undefined],
    ["PreToolUse", "using_tool", "Using tool: Bash"],
    ["PermissionRequest", "waiting_permission", undefined],
    ["PostToolUse", "running", undefined],
  ] as const)(
    "keeps stdout empty for a successful %s hook",
    async (hookEventName, status, message) => {
      const capture = captureIo();
      const target = captureClient();

      const code = await executeIngestCommand(
        ["codex-hook"],
        target.client,
        capture.io,
        async () =>
          JSON.stringify({
            session_id: `codex-${hookEventName}`,
            cwd: "/tmp/demo",
            hook_event_name: hookEventName,
            tool_name: "Bash",
            prompt: "secret prompt",
            tool_input: { command: "secret command" },
            tool_response: "secret response",
            transcript_path: "/tmp/secret-transcript",
            rawEvent: { secret: true },
          }),
      );

      expect(code).toBe(0);
      expect(target.events).toEqual([
        {
          source: "codex",
          surface: "cli",
          status,
          title: hookEventName,
          sessionId: `codex-${hookEventName}`,
          projectPath: "/tmp/demo",
          ...(message ? { message } : {}),
        },
      ]);
      expect(JSON.stringify(target.events)).not.toContain("secret");
      expect(JSON.stringify(capture)).not.toContain("secret");
      expectSilentCodexHook(capture);
    },
  );

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
    expect(capture.warnings.join("\n")).toContain("No event was recorded");
    expect(capture.warnings.join("\n")).toContain(
      "host workflow will continue",
    );
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
    expect(capture.warnings).toHaveLength(1);
    expect(capture.warnings[0]).toContain("so it was not recorded");
    expect(capture.warnings[0]).toContain(
      "agentpulse daemon --notifier console",
    );
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
    expect(capture.warnings).toHaveLength(1);
    expect(capture.warnings[0]).toContain(
      "unable to read platform input, so no event was recorded",
    );
    expect(capture.warnings[0]).toContain("agentpulse doctor");
    expect(capture.warnings.join("\n")).not.toContain("stdin detail");
  });

  it("returns empty stdout and stderr for unsupported Codex hooks", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["codex-hook"],
      target.client,
      capture.io,
      async () => JSON.stringify({ hook_event_name: "PreCompact" }),
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([]);
    expectSilentCodexHook(capture);
  });

  it.each(["{", JSON.stringify({ session_id: "missing-event" })])(
    "returns empty stdout and exit zero for invalid Codex hook input",
    async (input) => {
      const capture = captureIo();
      const target = captureClient();

      const code = await executeIngestCommand(
        ["codex-hook"],
        target.client,
        capture.io,
        async () => input,
      );

      expect(code).toBe(0);
      expect(target.events).toEqual([]);
      expectSilentCodexHook(capture);
    },
  );

  it.each(["Stop", "PreToolUse"] as const)(
    "keeps %s stdout and stderr empty when the daemon is unavailable",
    async (hookEventName) => {
      const capture = captureIo();
      const client: AgentPulseClient = {
        emit: async () => {
          throw new Error("private connection detail");
        },
        sessions: async () => [],
      };

      const code = await executeIngestCommand(
        ["codex-hook"],
        client,
        capture.io,
        async () =>
          JSON.stringify({
            session_id: "offline-hook",
            hook_event_name: hookEventName,
            tool_name: "Bash",
            prompt: "private prompt",
            tool_input: { command: "private command" },
          }),
      );

      expect(code).toBe(0);
      expect(JSON.stringify(capture)).not.toContain("private");
      expectSilentCodexHook(capture);
    },
  );

  it("returns empty stdout without stderr when Codex hook stdin cannot be read", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["codex-hook"],
      target.client,
      capture.io,
      async () => {
        throw new Error("private stdin detail");
      },
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([]);
    expect(JSON.stringify(capture)).not.toContain("private");
    expectSilentCodexHook(capture);
  });

  it("returns empty stdout without stderr for unexpected Codex hook arguments", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["codex-hook", "unexpected"],
      target.client,
      capture.io,
      async () => {
        throw new Error("stdin should not be read");
      },
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([]);
    expectSilentCodexHook(capture);
  });
});

describe("setup snippet commands", () => {
  it("prints the Claude Code snippet without SessionEnd", () => {
    const capture = captureIo();
    const snippets = createSetupSnippets(undefined, setupRuntime());

    expect(
      executeSetupCommand(
        ["claude-code", "--print"],
        capture.io,
        setupRuntime(),
      ),
    ).toBe(0);
    expect(capture.output).toEqual([snippets.claudeCode]);
    expect(capture.warnings).toHaveLength(1);
    expect(capture.warnings[0]).toContain("did not read or modify");
    expect(capture.warnings[0]).toContain("manually");
    expect(capture.warnings[0]).toContain("agentpulse doctor");
    expect(capture.warnings[0]).toContain("%USERPROFILE%");
    expect(snippets.claudeCode).toContain("UserPromptSubmit");
    expect(snippets.claudeCode).not.toContain("SessionEnd");
    expect(snippets.claudeCode).toContain(
      "/usr/local/bin/node /workspace/AgentPulse/packages/cli/dist/index.js ingest claude-code",
    );
  });

  it("prints the Codex notify snippet", () => {
    const capture = captureIo();
    const snippets = createSetupSnippets(undefined, setupRuntime());

    expect(
      executeSetupCommand(["codex", "--print"], capture.io, setupRuntime()),
    ).toBe(0);
    expect(capture.output).toEqual([snippets.codex]);
    expect(capture.warnings).toHaveLength(1);
    expect(capture.warnings[0]).toContain("did not read or modify");
    expect(capture.warnings[0]).toContain("do not overwrite");
    expect(capture.warnings[0]).toContain("project .codex/config.toml");
    expect(capture.warnings[0]).toContain("agentpulse doctor");
  });

  it("uses process.execPath for SEA snippets", () => {
    const snippets = createSetupSnippets(
      undefined,
      setupRuntime({
        isSea: () => true,
        execPath: "/opt/Agent Pulse/agentpulse",
        entryPath: undefined,
      }),
    );

    expect(snippets.codex).toBe(
      'notify = ["/opt/Agent Pulse/agentpulse", "ingest", "codex"]',
    );
    expect(snippets.codexHooks.available).toBe(true);
    expect(
      snippets.codexHooks.available ? snippets.codexHooks.snippet : "",
    ).toContain("'/opt/Agent Pulse/agentpulse' ingest codex-hook");
  });

  it("uses exact agentpulse only for explicit PATH mode", () => {
    const capture = captureIo();

    expect(
      executeSetupCommand(
        ["codex", "--print", "--binary", "agentpulse"],
        capture.io,
        setupRuntime(),
      ),
    ).toBe(0);
    expect(capture.output).toEqual([
      'notify = ["agentpulse", "ingest", "codex"]',
    ]);
  });

  it("accepts an absolute binary override and rejects relative paths", () => {
    expect(resolveAgentPulseCommand("/opt/agentpulse", setupRuntime())).toEqual(
      ["/opt/agentpulse"],
    );
    expect(() =>
      resolveAgentPulseCommand("./agentpulse", setupRuntime()),
    ).toThrow("absolute path");
  });

  it("renders a simple Windows commandWindows without quotes", () => {
    const runtime = setupRuntime({
      execPath: "C:\\Tools\\nodejs\\node.exe",
      entryPath: "C:\\AgentPulse\\packages\\cli\\dist\\index.js",
      platform: "win32",
    });
    const snippets = createSetupSnippets(undefined, runtime);
    expect(snippets.codexHooks.available).toBe(true);
    const parsed = JSON.parse(
      snippets.codexHooks.available ? snippets.codexHooks.snippet : "",
    ) as {
      hooks: {
        Stop: { hooks: { command: string; commandWindows?: string }[] }[];
      };
    };
    const handler = parsed.hooks.Stop[0]?.hooks[0];

    expect(handler?.command).toBe(
      '"C:\\Tools\\nodejs\\node.exe" "C:\\AgentPulse\\packages\\cli\\dist\\index.js" "ingest" "codex-hook"',
    );
    expect(handler?.commandWindows).toBe(
      "C:\\Tools\\nodejs\\node.exe C:\\AgentPulse\\packages\\cli\\dist\\index.js ingest codex-hook",
    );
    expect(handler?.commandWindows).not.toMatch(/^"/u);
    expect(snippets.codex).toContain('"C:\\\\Tools\\\\nodejs\\\\node.exe"');
  });

  it("renders a standalone Windows commandWindows without quotes", () => {
    const snippets = createSetupSnippets(
      undefined,
      setupRuntime({
        isSea: () => true,
        execPath: "C:\\Users\\demo\\Tools\\AgentPulse\\agentpulse.exe",
        entryPath: undefined,
        platform: "win32",
      }),
    );
    expect(snippets.codexHooks.available).toBe(true);
    const parsed = JSON.parse(
      snippets.codexHooks.available ? snippets.codexHooks.snippet : "",
    ) as {
      hooks: {
        Stop: { hooks: { commandWindows?: string }[] }[];
      };
    };

    expect(parsed.hooks.Stop[0]?.hooks[0]?.commandWindows).toBe(
      "C:\\Users\\demo\\Tools\\AgentPulse\\agentpulse.exe ingest codex-hook",
    );
  });

  it.each([" ", "\t", "&", "(", ")", "^", "%", "!", "'", '"', "<", ">", "|"])(
    "marks Windows Codex hooks unavailable for path character %j",
    (character) => {
      const snippets = createSetupSnippets(
        undefined,
        setupRuntime({
          isSea: () => true,
          execPath: `C:\\Users\\demo\\Agent${character}Pulse\\agentpulse.exe`,
          entryPath: undefined,
          platform: "win32",
        }),
      );

      expect(snippets.codexHooks).toEqual({
        available: false,
        reason: expect.objectContaining({
          code: "windows-codex-hooks-unsafe-command",
          message: expect.stringContaining("Codex CLI 0.141.0"),
          action: expect.stringContaining(
            "C:\\Users\\<user>\\Tools\\AgentPulse\\agentpulse.exe",
          ),
        }),
      });
      expect(snippets.codex).toContain('"ingest", "codex"');
    },
  );

  it("checks every Windows source-mode executable path token", () => {
    const snippets = createSetupSnippets(
      undefined,
      setupRuntime({
        execPath: "C:\\Tools\\nodejs\\node.exe",
        entryPath: "C:\\Agent Pulse\\packages\\cli\\dist\\index.js",
        platform: "win32",
      }),
    );

    expect(snippets.codexHooks).toEqual({
      available: false,
      reason: expect.objectContaining({
        code: "windows-codex-hooks-unsafe-command",
      }),
    });
  });

  it("fails closed when printing unavailable Windows Codex hooks", () => {
    const capture = captureIo();
    const runtime = setupRuntime({
      isSea: () => true,
      execPath: "C:\\Agent Pulse\\agentpulse.exe",
      entryPath: undefined,
      platform: "win32",
    });

    expect(
      executeSetupCommand(["codex-hooks", "--print"], capture.io, runtime),
    ).toBe(1);
    expect(capture.output).toEqual([]);
    expect(capture.warnings.join("\n")).toContain("setup unavailable");
    expect(capture.warnings.join("\n")).toContain("simple no-space path");
    expect(capture.warnings.join("\n")).not.toContain(
      "C:\\Agent Pulse\\agentpulse.exe",
    );

    const codexCapture = captureIo();
    expect(
      executeSetupCommand(["codex", "--print"], codexCapture.io, runtime),
    ).toBe(0);
    expect(codexCapture.output).toEqual([
      'notify = ["C:\\\\Agent Pulse\\\\agentpulse.exe", "ingest", "codex"]',
    ]);

    const claudeCapture = captureIo();
    expect(
      executeSetupCommand(
        ["claude-code", "--print"],
        claudeCapture.io,
        runtime,
      ),
    ).toBe(0);
    const claudeSetup = JSON.parse(claudeCapture.output[0] ?? "{}") as {
      hooks?: {
        Stop?: { hooks?: { command?: string }[] }[];
      };
    };
    expect(claudeSetup.hooks?.Stop?.[0]?.hooks?.[0]?.command).toBe(
      '"C:\\Agent Pulse\\agentpulse.exe" "ingest" "claude-code"',
    );
  });

  it("quotes POSIX shell tokens without depending on cwd", () => {
    expect(
      renderHookCommand(
        ["/opt/Agent Pulse/agentpulse", "ingest", "codex-hook"],
        "linux",
      ),
    ).toBe("'/opt/Agent Pulse/agentpulse' ingest codex-hook");
  });
});
