import type {
  AgentEvent,
  AgentEventInput,
  AgentSession,
} from "@crewlight/core";
import {
  CrewlightService,
  startDaemon,
  type DaemonInstance,
  type IngestResult,
} from "@crewlight/daemon";
import type { Notifier } from "@crewlight/notifier";
import { afterEach, describe, expect, it } from "vitest";

import { DaemonClient, type CrewlightClient } from "../src/daemon-client.js";
import {
  executeDaemonCommand,
  resolveDaemonCommandOptions,
} from "../src/commands/daemon.js";
import { executeEmitCommand } from "../src/commands/emit.js";
import { executeRunCommand } from "../src/commands/run.js";
import { executeStatusCommand } from "../src/commands/status.js";
import type { CommandIo } from "../src/commands/types.js";
import { isMainModule } from "../src/index.js";

class SilentNotifier implements Notifier {
  notify(_event: AgentEvent, _session: AgentSession): void {}
}

function captureIo() {
  const output: string[] = [];
  const warnings: string[] = [];
  const io: CommandIo = {
    write: (message) => output.push(message),
    warn: (message) => warnings.push(message),
  };
  return { io, output, warnings };
}

let daemon: DaemonInstance | undefined;

afterEach(async () => {
  await daemon?.close();
  daemon = undefined;
});

describe("CLI commands", () => {
  it("recognizes a symlinked executable as the main module", () => {
    expect(isMainModule(import.meta.url, process.argv[1])).toBe(false);
    expect(
      isMainModule(
        new URL("../src/index.ts", import.meta.url).href,
        "packages/cli/src/index.ts",
      ),
    ).toBe(true);
  });

  it("emits and lists a session through the daemon client", async () => {
    daemon = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new CrewlightService({ notifier: new SilentNotifier() }),
    );
    const client = new DaemonClient({ baseUrl: daemon.url });
    const capture = captureIo();

    const emitCode = await executeEmitCommand(
      [
        "--source",
        "custom",
        "--surface",
        "manual",
        "--status",
        "completed",
        "--session-id",
        "cli-test",
        "--message",
        "done",
      ],
      client,
      capture.io,
    );
    const statusCode = await executeStatusCommand(
      ["--json"],
      client,
      capture.io,
    );

    expect(emitCode).toBe(0);
    expect(statusCode).toBe(0);
    expect(capture.output[0]).toContain("Accepted custom/completed");
    expect(capture.output[1]).toContain('"sessionId": "cli-test"');
    expect(capture.output[1]).toContain('"status": "completed"');
  });

  it("runs successfully even when the daemon is unavailable", async () => {
    const capture = captureIo();
    const client: CrewlightClient = {
      emit: async (_event: AgentEventInput): Promise<IngestResult> => {
        throw new Error("daemon unavailable");
      },
      sessions: async () => [],
    };

    const code = await executeRunCommand(
      [
        "--source",
        "generic-cli",
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      client,
      capture.io,
    );

    expect(code).toBe(0);
    expect(capture.output.join("\n")).toContain("running");
    expect(capture.output.join("\n")).toContain("completed");
    expect(capture.warnings).toHaveLength(2);
  });

  it("gives an actionable daemon-unreachable error without transport details", async () => {
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:1",
    });

    await expect(client.sessions()).rejects.toThrow(
      "crewlight daemon --notifier console",
    );
    await expect(client.sessions()).rejects.not.toThrow("fetch failed");
  });

  it("preserves a wrapped command's non-zero exit code", async () => {
    const capture = captureIo();
    const client: CrewlightClient = {
      emit: async (event): Promise<IngestResult> => ({
        event: event as AgentEvent,
        session: {} as AgentSession,
      }),
      sessions: async () => [],
    };

    const code = await executeRunCommand(
      ["--", process.execPath, "-e", "process.exit(9)"],
      client,
      capture.io,
    );

    expect(code).toBe(9);
    expect(capture.output.join("\n")).toContain("exitCode=9");
  });

  it("rejects platform labels that are not implemented adapters", async () => {
    const capture = captureIo();
    const client: CrewlightClient = {
      emit: async () => {
        throw new Error("not called");
      },
      sessions: async () => [],
    };

    await expect(
      executeRunCommand(
        ["--source", "codex", "--", process.execPath, "-e", ""],
        client,
        capture.io,
      ),
    ).rejects.toThrow("supports only --source generic-cli");
  });

  it("explains how to recover from a daemon port conflict", async () => {
    daemon = await startDaemon(
      { host: "127.0.0.1", port: 0 },
      new CrewlightService({ notifier: new SilentNotifier() }),
    );
    const capture = captureIo();

    await expect(
      executeDaemonCommand(
        ["--host", "127.0.0.1", "--port", String(daemon.port)],
        capture.io,
      ),
    ).rejects.toThrow("already in use");
    await expect(
      executeDaemonCommand(
        ["--host", "127.0.0.1", "--port", String(daemon.port)],
        capture.io,
      ),
    ).rejects.toThrow("crewlight daemon --port <port>");
  });

  it("rejects a dashboard bound outside loopback", async () => {
    const capture = captureIo();

    await expect(
      executeDaemonCommand(
        ["--dashboard", "--host", "0.0.0.0", "--notifier", "none"],
        capture.io,
      ),
    ).rejects.toThrow("127.0.0.1");
  });

  it("defaults dashboard startup to IPv4 loopback without host overrides", () => {
    expect(
      resolveDaemonCommandOptions(["--dashboard", "--notifier", "none"], {}),
    ).toMatchObject({
      dashboard: true,
      dashboardTaskTitleMode: "off",
      config: { host: "127.0.0.1", notifier: "none" },
    });
  });

  it("enables prompt-preview task titles only with the dashboard", () => {
    expect(
      resolveDaemonCommandOptions(
        [
          "--dashboard",
          "--dashboard-task-titles",
          "prompt-preview",
          "--notifier",
          "none",
        ],
        {},
      ),
    ).toMatchObject({
      dashboard: true,
      dashboardTaskTitleMode: "prompt-preview",
    });
    expect(() =>
      resolveDaemonCommandOptions(
        ["--dashboard-task-titles", "prompt-preview"],
        {},
      ),
    ).toThrow("requires `--dashboard`");
    expect(() =>
      resolveDaemonCommandOptions(
        ["--dashboard", "--dashboard-task-titles", "unsupported"],
        {},
      ),
    ).toThrow("Use `prompt-preview`");
  });

  it("allows both explicit loopback dashboard hosts", () => {
    expect(
      resolveDaemonCommandOptions(["--dashboard", "--host", "127.0.0.1"], {})
        .config.host,
    ).toBe("127.0.0.1");
    expect(
      resolveDaemonCommandOptions(["--dashboard", "--host", "::1"], {}).config
        .host,
    ).toBe("::1");
  });

  it("rejects an unsafe dashboard host from the environment", () => {
    expect(() =>
      resolveDaemonCommandOptions(["--dashboard"], {
        CREWLIGHT_HOST: "0.0.0.0",
      }),
    ).toThrow("127.0.0.1");
  });
});
