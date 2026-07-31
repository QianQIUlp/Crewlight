import { describe, expect, it } from "vitest";
import { dirname, win32 } from "node:path";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectPnpmVersion,
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
    codexSnippet: () => 'notify = ["/opt/crewlight", "ingest", "codex"]',
    codexHooksSetup: () => ({
      available: true,
      snippet: '{"hooks":{"Stop":[]}}',
    }),
    daemonEnv: () => ({ host: "127.0.0.1", port: 3768 }),
    entryPath: () => "/opt/crewlight/dist/index.js",
    pathResolvedCrewlight: () => "/opt/crewlight/dist/index.js",
    dashboardCapabilities: async () => ({ taskTitleMode: "off" }),
    ...overrides,
  };
}

describe("doctor command", () => {
  it("checks pnpm through cmd.exe on Windows so pnpm.cmd is discoverable", () => {
    const calls: Array<{
      command: string;
      args: string[];
      options: unknown;
    }> = [];
    const version = detectPnpmVersion(
      "win32",
      (command, args, options) => {
        calls.push({ command, args, options });
        return { status: 0, stdout: "10.11.0\r\n" };
      },
      () => "C:\\Tools\\pnpm.cmd",
    );

    expect(version).toBe("10.11.0");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe(
      win32.join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "cmd.exe",
      ),
    );
    expect(calls[0]?.args.slice(0, 4)).toEqual(["/d", "/s", "/v:off", "/c"]);
    expect(calls[0]?.args[4]).toContain("pnpm.cmd");
    expect(calls[0]?.options).toMatchObject({
      cwd: dirname(process.execPath),
      windowsVerbatimArguments: true,
    });
  });

  it("keeps direct pnpm execution on non-Windows platforms", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const version = detectPnpmVersion("linux", (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: "10.11.0\n" };
    });

    expect(version).toBe("10.11.0");
    expect(calls).toEqual([{ command: "pnpm", args: ["--version"] }]);
  });

  it.runIf(process.platform === "win32")(
    "does not execute a repository-local pnpm.cmd while checking the version",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "crewlight-doctor-pnpm-"));
      const untrustedCwd = join(root, "untrusted");
      const safePath = join(root, "safe-path");
      const marker = join(root, "repo-pnpm-ran.txt");
      const previousCwd = process.cwd();
      const previousPath = process.env.PATH;
      const previousPathCase = process.env.Path;
      await Promise.all([
        mkdir(untrustedCwd, { recursive: true }),
        mkdir(safePath, { recursive: true }),
      ]);
      await writeFile(
        join(untrustedCwd, "pnpm.cmd"),
        `@echo off\r\n>"${marker}" echo executed\r\necho 0.0.0\r\n`,
        "utf8",
      );
      await writeFile(
        join(safePath, "pnpm.cmd"),
        "@echo off\r\necho 10.11.0\r\n",
        "utf8",
      );

      try {
        process.chdir(untrustedCwd);
        process.env.PATH = safePath;
        process.env.Path = safePath;

        expect(detectPnpmVersion()).toBe("10.11.0");
        await expect(access(marker)).rejects.toBeTruthy();
      } finally {
        process.chdir(previousCwd);
        if (previousPath === undefined) {
          delete process.env.PATH;
        } else {
          process.env.PATH = previousPath;
        }
        if (previousPathCase === undefined) {
          delete process.env.Path;
        } else {
          process.env.Path = previousPathCase;
        }
        await rm(root, { force: true, recursive: true });
      }
    },
  );

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

  it.each(["localhost", "0.0.0.0"])(
    "warns when daemon host %s is outside the literal loopback boundary",
    async (host) => {
      const capture = captureIo();

      const code = await executeDoctorCommand(
        ["--notifier", "console"],
        capture.io,
        runtime({ daemonEnv: () => ({ host, port: 3768 }) }),
      );

      expect(code).toBe(0);
      expect(capture.warnings.join("\n")).toContain("[warning] daemon-host");
      expect(capture.warnings.join("\n")).toContain(
        "has no client authentication",
      );
      expect(capture.warnings.join("\n")).toContain("CREWLIGHT_HOST=127.0.0.1");
    },
  );

  it("returns non-zero when the daemon is unreachable", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      [],
      capture.io,
      runtime({
        daemonReachable: async () => false,
        dashboardCapabilities: async () => {
          throw new Error("capabilities must not be probed while offline");
        },
      }),
    );

    expect(code).toBe(1);
    expect(capture.warnings.join("\n")).toContain("[error] daemon");
    expect(capture.warnings.join("\n")).toContain(
      "crewlight daemon --notifier console",
    );
    expect(capture.output.join("\n")).toContain(
      "[skipped] capabilities-endpoint",
    );
    expect(capture.output.join("\n")).not.toContain(
      "capabilities endpoint is reachable",
    );
  });

  it("warns without failing when the optional dashboard capabilities endpoint is unavailable", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      [],
      capture.io,
      runtime({ dashboardCapabilities: async () => undefined }),
    );

    expect(code).toBe(0);
    expect(capture.output.join("\n")).toContain("[ok] daemon");
    expect(capture.warnings.join("\n")).toContain(
      "[warning] capabilities-endpoint",
    );
    expect(capture.output.join("\n")).not.toContain(
      "capabilities endpoint is reachable",
    );
  });

  it("fails when an expected task-title mode cannot be checked", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      ["--expect-task-titles", "off"],
      capture.io,
      runtime({ dashboardCapabilities: async () => undefined }),
    );

    expect(code).toBe(1);
    expect(capture.warnings.join("\n")).toContain(
      "[error] capabilities-endpoint",
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
      "crewlight daemon --notifier console",
    );
  });

  it("identifies a missing packaged Windows notifier asset", async () => {
    const capture = captureIo();

    const code = await executeDoctorCommand(
      ["--notifier", "os"],
      capture.io,
      runtime({
        osNotifier: async () => ({ available: false, reason: "asset" }),
      }),
    );

    expect(code).toBe(0);
    expect(capture.warnings.join("\n")).toContain(
      "packaged Windows notification helper is missing",
    );
    expect(capture.warnings.join("\n")).toContain("Reinstall Crewlight");
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
              "Install Crewlight into C:\\Users\\<user>\\Tools\\Crewlight.",
          },
        }),
      }),
    );

    expect(code).toBe(0);
    expect(capture.warnings.join("\n")).toContain(
      "[warning] setup-codex-hooks",
    );
    expect(capture.warnings.join("\n")).toContain(
      "C:\\Users\\<user>\\Tools\\Crewlight",
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
      message: "Crewlight is running as a standalone binary.",
    });
  });
});
