import { readFileSync } from "node:fs";

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
        surface: "unknown",
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

  it("uses --hook before stdin hook_event_name", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["codex-hook", "--hook", "Stop"],
      target.client,
      capture.io,
      async () =>
        JSON.stringify({
          session_id: "codex-override",
          cwd: "/tmp/demo",
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          prompt: "secret prompt",
          tool_input: { command: "secret command" },
        }),
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([
      {
        source: "codex",
        surface: "unknown",
        status: "completed",
        title: "Stop",
        sessionId: "codex-override",
        projectPath: "/tmp/demo",
      },
    ]);
    expect(JSON.stringify(target.events)).not.toContain("secret");
    expectSilentCodexHook(capture);
  });

  it.each([
    ["empty stdin", async () => ""],
    ["invalid JSON", async () => "{"],
    [
      "missing hook_event_name",
      async () => JSON.stringify({ session_id: "payload-session" }),
    ],
    [
      "unreadable stdin",
      async () => {
        throw new Error("private stdin detail");
      },
    ],
  ] as const)(
    "uses a valid --hook with %s",
    async (_description, readHookStdin) => {
      const capture = captureIo();
      const target = captureClient();

      const code = await executeIngestCommand(
        ["codex-hook", "--hook", "Stop"],
        target.client,
        capture.io,
        readHookStdin,
      );

      expect(code).toBe(0);
      expect(target.events).toEqual([
        {
          source: "codex",
          surface: "unknown",
          status: "completed",
          title: "Stop",
          ...(_description === "missing hook_event_name"
            ? { sessionId: "payload-session" }
            : {}),
        },
      ]);
      expect(JSON.stringify(capture)).not.toContain("private");
      expectSilentCodexHook(capture);
    },
  );

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
          surface: "unknown",
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
        ["codex-hook", "--hook", hookEventName],
        client,
        capture.io,
        async () =>
          JSON.stringify({
            session_id: "offline-hook",
            hook_event_name: hookEventName === "Stop" ? "PreToolUse" : "Stop",
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

  it.each([
    ["--hook"],
    ["--hook", "PreCompact"],
    ["--hook", "Stop", "--hook", "PreToolUse"],
    ["--hook", "Stop", "extra"],
    ["unexpected"],
  ])(
    "silently ignores malformed or unsupported Codex hook arguments: %j",
    async (...platformArgs) => {
      const capture = captureIo();
      const target = captureClient();

      const code = await executeIngestCommand(
        ["codex-hook", ...platformArgs],
        target.client,
        capture.io,
        async () => {
          throw new Error("stdin must not be read");
        },
      );

      expect(code).toBe(0);
      expect(target.events).toEqual([]);
      expectSilentCodexHook(capture);
    },
  );

  it("accepts an explicit Codex Desktop surface", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["codex-hook", "--surface", "desktop", "--hook", "PermissionRequest"],
      target.client,
      capture.io,
      async () => JSON.stringify({ session_id: "desktop-session" }),
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([
      {
        source: "codex",
        surface: "desktop",
        status: "waiting_permission",
        title: "PermissionRequest",
        sessionId: "desktop-session",
      },
    ]);
    expectSilentCodexHook(capture);
  });

  it.each([
    ["--surface", "cloud"],
    ["--surface", "desktop", "--surface", "cli"],
  ])(
    "silently ignores unsupported Codex surface arguments: %j",
    async (...args) => {
      const capture = captureIo();
      const target = captureClient();

      const code = await executeIngestCommand(
        ["codex-hook", ...args],
        target.client,
        capture.io,
        async () => {
          throw new Error("stdin must not be read");
        },
      );

      expect(code).toBe(0);
      expect(target.events).toEqual([]);
      expectSilentCodexHook(capture);
    },
  );

  it("maps an OpenCode plugin event and strips sensitive fields", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["opencode-plugin", "--event", "permission.asked"],
      target.client,
      capture.io,
      async () =>
        JSON.stringify({
          cwd: "/tmp/opencode",
          event: {
            type: "message.updated",
            properties: {
              sessionID: "opencode-session",
              prompt: "secret prompt",
              message: "secret message",
              args: { command: "secret command" },
              result: "secret result",
            },
          },
        }),
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([
      {
        source: "opencode",
        surface: "unknown",
        status: "waiting_permission",
        title: "permission.asked",
        message: "OpenCode permission requested",
        sessionId: "opencode-session",
        projectPath: "/tmp/opencode",
      },
    ]);
    expect(JSON.stringify(target.events)).not.toContain("secret");
    expectSilentCodexHook(capture);
  });

  it.each([
    ["unknown event", JSON.stringify({ event: { type: "session.deleted" } })],
    ["invalid stdin", "{"],
    ["missing event", JSON.stringify({ cwd: "/tmp/demo" })],
  ])("silently ignores OpenCode %s", async (_description, input) => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["opencode-plugin"],
      target.client,
      capture.io,
      async () => input,
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([]);
    expectSilentCodexHook(capture);
  });

  it("keeps OpenCode daemon failures silent", async () => {
    const capture = captureIo();
    const client: AgentPulseClient = {
      emit: async () => {
        throw new Error("private connection detail");
      },
      sessions: async () => [],
    };

    const code = await executeIngestCommand(
      ["opencode-plugin", "--event", "session.idle"],
      client,
      capture.io,
      async () => "",
    );

    expect(code).toBe(0);
    expect(JSON.stringify(capture)).not.toContain("private");
    expectSilentCodexHook(capture);
  });

  it("sends a sanitized Antigravity research probe", async () => {
    const capture = captureIo();
    const target = captureClient();

    const code = await executeIngestCommand(
      ["antigravity-probe", "--event", "SessionStart", "--surface", "desktop"],
      target.client,
      capture.io,
      async () =>
        JSON.stringify({
          session_id: "antigravity-session",
          cwd: "/tmp/antigravity",
          prompt: "secret prompt",
          transcript: "secret transcript",
          tool_input: { command: "secret command" },
          env: { TOKEN: "secret token" },
          rawEvent: { secret: true },
        }),
    );

    expect(code).toBe(0);
    expect(target.events).toEqual([
      {
        source: "antigravity",
        surface: "desktop",
        status: "unknown",
        title: "SessionStart",
        message: "Antigravity probe event observed",
        sessionId: "antigravity-session",
        projectPath: "/tmp/antigravity",
      },
    ]);
    expect(JSON.stringify(target.events)).not.toContain("secret");
    expectSilentCodexHook(capture);
  });

  it.each([
    ["missing stdin", ""],
    ["invalid stdin", "{"],
    ["valid stdin", JSON.stringify({ event: { type: "SessionStart" } })],
  ])(
    "keeps Antigravity %s silent and successful",
    async (_description, input) => {
      const capture = captureIo();
      const target = captureClient();

      const code = await executeIngestCommand(
        ["antigravity-probe"],
        target.client,
        capture.io,
        async () => input,
      );

      expect(code).toBe(0);
      expectSilentCodexHook(capture);
    },
  );

  it("keeps Antigravity daemon failures silent", async () => {
    const capture = captureIo();
    const client: AgentPulseClient = {
      emit: async () => {
        throw new Error("private connection detail");
      },
      sessions: async () => [],
    };

    const code = await executeIngestCommand(
      ["antigravity-probe", "--event", "Stop"],
      client,
      capture.io,
      async () => "{",
    );

    expect(code).toBe(0);
    expect(JSON.stringify(capture)).not.toContain("private");
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
      '"C:\\Tools\\nodejs\\node.exe" "C:\\AgentPulse\\packages\\cli\\dist\\index.js" "ingest" "codex-hook" "--hook" "Stop" "--surface" "cli"',
    );
    expect(handler?.commandWindows).toBe(
      "C:\\Tools\\nodejs\\node.exe C:\\AgentPulse\\packages\\cli\\dist\\index.js ingest codex-hook --hook Stop --surface cli",
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
      "C:\\Users\\demo\\Tools\\AgentPulse\\agentpulse.exe ingest codex-hook --hook Stop --surface cli",
    );
  });

  it("generates a matching --hook command for every Codex event", () => {
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
      hooks: Record<
        string,
        { hooks: { command: string; commandWindows?: string }[] }[]
      >;
    };

    for (const hookEventName of [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "Stop",
    ]) {
      const handler = parsed.hooks[hookEventName]?.[0]?.hooks[0];
      expect(handler?.command).toContain(`"--hook" "${hookEventName}"`);
      expect(handler?.commandWindows).toBe(
        `C:\\Users\\demo\\Tools\\AgentPulse\\agentpulse.exe ingest codex-hook --hook ${hookEventName} --surface cli`,
      );
      expect(handler?.commandWindows).not.toMatch(/^"/u);
    }
  });

  it("generates matching POSIX --hook commands for every Codex event", () => {
    const snippets = createSetupSnippets(undefined, setupRuntime());
    expect(snippets.codexHooks.available).toBe(true);
    const parsed = JSON.parse(
      snippets.codexHooks.available ? snippets.codexHooks.snippet : "",
    ) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };

    for (const hookEventName of [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "Stop",
    ]) {
      expect(parsed.hooks[hookEventName]?.[0]?.hooks[0]?.command).toBe(
        `/usr/local/bin/node /workspace/AgentPulse/packages/cli/dist/index.js ingest codex-hook --hook ${hookEventName} --surface cli`,
      );
    }
  });

  it("generates an explicit experimental Codex Desktop surface", () => {
    const capture = captureIo();

    expect(
      executeSetupCommand(
        ["codex-hooks", "--print", "--surface", "desktop"],
        capture.io,
        setupRuntime(),
      ),
    ).toBe(0);
    expect(capture.output[0]).toContain("--surface desktop");
    expect(capture.warnings.join("\n")).toContain(
      "only for an explicit local Codex Desktop verification",
    );
  });

  it("rejects setup surfaces outside Codex hooks", () => {
    expect(() =>
      executeSetupCommand(
        ["opencode", "--print", "--surface", "desktop"],
        captureIo().io,
        setupRuntime(),
      ),
    ).toThrow("Usage:");
    expect(() =>
      executeSetupCommand(
        ["codex-hooks", "--print", "--surface", "cloud"],
        captureIo().io,
        setupRuntime(),
      ),
    ).toThrow("Usage:");
  });

  it("prints a guarded argv-style OpenCode plugin", () => {
    const capture = captureIo();
    const snippets = createSetupSnippets(undefined, setupRuntime());

    expect(
      executeSetupCommand(["opencode", "--print"], capture.io, setupRuntime()),
    ).toBe(0);
    expect(capture.output).toEqual([snippets.openCode]);
    expect(snippets.openCode).toContain("globalThis.Bun");
    expect(snippets.openCode).toContain('typeof bun.spawn !== "function"');
    expect(snippets.openCode).toContain("bun.spawn(");
    expect(snippets.openCode).toContain('"opencode-plugin"');
    expect(snippets.openCode).toContain('"--event"');
    expect(snippets.openCode).toContain('stdout: "ignore"');
    expect(snippets.openCode).toContain('stderr: "ignore"');
    expect(snippets.openCode).toContain('typeof proc.unref === "function"');
    expect(snippets.openCode).toContain("catch {}");
    expect(snippets.openCode).not.toContain("prompt");
    expect(snippets.openCode).not.toContain("tool_input");
    expect(snippets.openCode).not.toContain("tool_output");
    expect(snippets.openCode).not.toContain("result:");
    expect(capture.warnings.join("\n")).toContain(
      ".opencode/plugins/agentpulse.js",
    );
    expect(capture.warnings.join("\n")).toContain(
      "~/.config/opencode/plugins/agentpulse.js",
    );
    expect(capture.warnings.join("\n")).toContain(
      "pending real local verification",
    );
  });

  it("runs the generated OpenCode plugin with sanitized argv-style input", async () => {
    const snippets = createSetupSnippets(undefined, setupRuntime());
    const calls: {
      argv: string[];
      options: { stdin: Blob; stdout: string; stderr: string };
      unrefCalled: boolean;
    }[] = [];
    const runtimeGlobal = globalThis as typeof globalThis & {
      Bun?: {
        spawn(
          argv: string[],
          options: { stdin: Blob; stdout: string; stderr: string },
        ): { unref(): void };
      };
    };
    const previousBun = runtimeGlobal.Bun;
    runtimeGlobal.Bun = {
      spawn: (argv, options) => {
        const call = { argv, options, unrefCalled: false };
        calls.push(call);
        return {
          unref: () => {
            call.unrefCalled = true;
          },
        };
      },
    };

    try {
      const encoded = Buffer.from(snippets.openCode).toString("base64");
      const pluginModule = (await import(
        `data:text/javascript;base64,${encoded}`
      )) as {
        AgentPulsePlugin(input: { directory: string }): Promise<{
          event(input: { event: unknown }): Promise<void>;
          "tool.execute.before"(input: unknown): Promise<void>;
        }>;
      };
      const plugin = await pluginModule.AgentPulsePlugin({
        directory: "/safe/project",
      });

      await plugin.event({
        event: {
          type: "session.status",
          properties: {
            sessionID: "safe-session",
            status: { type: "busy", message: "secret status message" },
            prompt: "secret prompt",
            args: { command: "secret command" },
            result: "secret result",
          },
        },
      });
      await plugin["tool.execute.before"]({
        sessionID: "safe-session",
        args: { command: "secret command" },
      });

      expect(calls).toHaveLength(2);
      expect(calls[0]?.argv).toEqual([
        "/usr/local/bin/node",
        "/workspace/AgentPulse/packages/cli/dist/index.js",
        "ingest",
        "opencode-plugin",
        "--event",
        "session.status",
      ]);
      expect(calls[0]?.options).toMatchObject({
        stdout: "ignore",
        stderr: "ignore",
      });
      expect(calls.every((call) => call.unrefCalled)).toBe(true);
      const payload = await calls[0]?.options.stdin.text();
      expect(payload).toContain('"sessionID":"safe-session"');
      expect(payload).toContain('"type":"busy"');
      expect(payload).toContain('"cwd":"/safe/project"');
      expect(payload).not.toContain("secret");
    } finally {
      runtimeGlobal.Bun = previousBun;
    }
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

describe("adapter documentation boundaries", () => {
  it("documents OpenCode placement without claiming verified support", () => {
    const content = readFileSync(
      new URL("../../../docs/opencode.md", import.meta.url),
      "utf8",
    );

    expect(content).toContain(".opencode/plugins/agentpulse.js");
    expect(content).toContain("~/.config/opencode/plugins/agentpulse.js");
    expect(content).toMatch(/pending real\s+local verification/u);
    expect(content).toContain("OpenCode Desktop");
    expect(content).toContain("`experimental`");
  });

  it("marks Codex Desktop experimental and Antigravity research-only", () => {
    const codexDesktop = readFileSync(
      new URL("../../../docs/codex-desktop.md", import.meta.url),
      "utf8",
    );
    const antigravity = readFileSync(
      new URL("../../../docs/antigravity.md", import.meta.url),
      "utf8",
    );

    expect(codexDesktop).toContain("`experimental`");
    expect(codexDesktop).toContain("--surface desktop");
    expect(antigravity).toContain("`research-only`");
    expect(antigravity).toMatch(/has not\s+verified/u);
    expect(antigravity).not.toContain("supported integration");
  });
});
