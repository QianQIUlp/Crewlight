import { describe, expect, it } from "vitest";

import {
  executeDoctorCommand,
  type DoctorRuntime,
} from "../src/commands/doctor.js";
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

function runtime(overrides: Partial<DoctorRuntime> = {}): DoctorRuntime {
  return {
    standalone: () => false,
    nodeVersion: () => "22.16.0",
    pnpmVersion: () => "10.11.0",
    cliBuilt: async () => true,
    daemonReachable: async () => true,
    osNotifier: async () => ({ available: true }),
    claudeSnippet: () => '{"hooks":{"Stop":[]}}',
    codexSnippet: () => 'notify = ["/opt/agentpulse", "ingest", "codex"]',
    codexHooksSetup: () => ({
      available: true,
      snippet: '{"hooks":{"Stop":[]}}',
    }),
    daemonEnv: () => ({ host: "127.0.0.1", port: 3768 }),
    entryPath: () => "/opt/agentpulse/dist/index.js",
    pathResolvedAgentpulse: () => "/opt/agentpulse/dist/index.js",
    dashboardCapabilities: async () => ({ taskTitleMode: "off" }),
    ...overrides,
  };
}

describe("doctor command", () => {
  it("passes when required checks pass and warnings are absent", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      ["--notifier", "console"],
      capture.io,
      runtime(),
    );

    expect(code).toBe(0);
    expect(capture.warnings).toEqual([]);
    expect(capture.output.join("\n")).toContain("[ok] daemon");
    expect(capture.output.join("\n")).toContain("[ok] setup-codex");
  });

  it("returns non-zero when the daemon is unreachable", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      [],
      capture.io,
      runtime({ daemonReachable: async () => false }),
    );

    expect(code).toBe(1);
    expect(capture.warnings.join("\n")).toContain("[error] daemon");
    expect(capture.warnings.join("\n")).toContain(
      "agentpulse daemon --notifier console",
    );
  });

  it("keeps OS notifier availability problems as warnings", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      ["--notifier", "os"],
      capture.io,
      runtime({
        osNotifier: async () => ({ available: false, reason: "import" }),
      }),
    );

    expect(code).toBe(0);
    expect(capture.warnings.join("\n")).toContain("[warning] notifier");
    expect(capture.warnings.join("\n")).toContain(
      "agentpulse daemon --notifier console",
    );
  });

  it("emits one machine-readable report for --json", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      ["--json", "--notifier", "none"],
      capture.io,
      runtime({ pnpmVersion: () => undefined }),
    );
    const report = JSON.parse(capture.output[0] ?? "{}") as {
      ok: boolean;
      checks: { id: string; status: string }[];
    };

    expect(code).toBe(0);
    expect(capture.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual({
      id: "pnpm",
      status: "warning",
      message: "pnpm was not found. Installed CLI usage can continue.",
      action: "For source builds, enable Corepack and install pnpm 10.11.0.",
    });
  });

  it("fails when setup generation or the CLI build is invalid", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      [],
      capture.io,
      runtime({
        cliBuilt: async () => false,
        claudeSnippet: () => "{",
        codexSnippet: () => "invalid",
        codexHooksSetup: () => ({ available: true, snippet: "{" }),
      }),
    );

    expect(code).toBe(1);
    expect(capture.warnings.join("\n")).toContain("[error] cli-build");
    expect(capture.warnings.join("\n")).toContain("[error] setup-claude-code");
    expect(capture.warnings.join("\n")).toContain("[error] setup-codex");
    expect(capture.warnings.join("\n")).toContain("[error] setup-codex-hooks");
  });

  it("reports unavailable Windows Codex hooks as a non-failing warning", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      [],
      capture.io,
      runtime({
        codexHooksSetup: () => ({
          available: false,
          reason: {
            code: "windows-codex-hooks-unsafe-command",
            message: "Codex hooks setup is unavailable for this Windows path.",
            action:
              "Install AgentPulse into C:\\Users\\<user>\\Tools\\AgentPulse.",
          },
        }),
      }),
    );

    expect(code).toBe(0);
    expect(capture.warnings.join("\n")).toContain(
      "[warning] setup-codex-hooks",
    );
    expect(capture.warnings.join("\n")).toContain(
      "C:\\Users\\<user>\\Tools\\AgentPulse",
    );
  });

  it("skips source tooling checks for a standalone binary", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      ["--json", "--notifier", "none"],
      capture.io,
      runtime({
        standalone: () => true,
        pnpmVersion: () => {
          throw new Error("pnpm must not be checked");
        },
        cliBuilt: async () => {
          throw new Error("source build must not be checked");
        },
      }),
    );
    const report = JSON.parse(capture.output[0] ?? "{}") as {
      checks: { id: string; status: string; message: string }[];
    };

    expect(code).toBe(0);
    expect(report.checks).toContainEqual({
      id: "pnpm",
      status: "skipped",
      message: "pnpm is not required by the standalone binary.",
    });
    expect(report.checks).toContainEqual({
      id: "cli-build",
      status: "ok",
      message: "AgentPulse is running as a standalone binary.",
    });
  });
});
