import { access, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { sep } from "node:path";
import { isSea } from "node:sea";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import {
  isNotifierKind,
  probeOsNotifier,
  type NotifierKind,
  type OsNotifierProbeResult,
} from "@crewlight/notifier";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@crewlight/shared";

import { DaemonClient } from "../daemon-client.js";
import { createSetupSnippets, type CodexHooksSetupResult } from "./setup.js";
import type { CommandIo } from "./types.js";

export type DoctorCheckStatus = "ok" | "warning" | "error" | "skipped";

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  message: string;
  action?: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorRuntime {
  standalone(): boolean;
  nodeVersion(): string;
  pnpmVersion(): string | undefined;
  cliBuilt(): Promise<boolean>;
  daemonReachable(): Promise<boolean>;
  dashboardCapabilities(): Promise<{ taskTitleMode: string } | undefined>;
  pathResolvedCrewlight(): string | undefined;
  entryPath(): string | undefined;
  daemonEnv(): { host: string; port: number };
  osNotifier(): Promise<OsNotifierProbeResult>;
  claudeSnippet(): string;
  codexSnippet(): string;
  codexHooksSetup(): CodexHooksSetupResult;
}

export interface DoctorRuntimeOptions {
  baseUrl?: string;
}

export function createDoctorRuntime(
  options: DoctorRuntimeOptions = {},
): DoctorRuntime {
  const setup = createSetupSnippets();
  const client = new DaemonClient(
    options.baseUrl ? { baseUrl: options.baseUrl } : {},
  );
  return {
    standalone: isSea,
    nodeVersion: () => process.versions.node,
    pnpmVersion: () => {
      const result = spawnSync("pnpm", ["--version"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return result.status === 0 ? result.stdout.trim() : undefined;
    },
    cliBuilt: async () => {
      const entryPath = process.argv[1];
      if (!entryPath) {
        return false;
      }

      try {
        await access(entryPath, fsConstants.X_OK);
        const resolved = await realpath(entryPath);
        return resolved.includes(`${sep}dist${sep}`);
      } catch {
        return false;
      }
    },
    daemonReachable: async () => {
      try {
        await client.sessions();
        return true;
      } catch {
        return false;
      }
    },
    dashboardCapabilities: async () => {
      try {
        return await client.dashboardCapabilities?.();
      } catch {
        return undefined;
      }
    },
    pathResolvedCrewlight: () => {
      try {
        const result = spawnSync(
          process.platform === "win32" ? "where" : "which",
          ["crewlight"],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          },
        );
        return result.status === 0
          ? result.stdout.trim().split("\n")[0]
          : undefined;
      } catch {
        return undefined;
      }
    },
    entryPath: () => process.argv[1],
    daemonEnv: () => {
      const host = process.env.CREWLIGHT_HOST ?? DEFAULT_DAEMON_HOST;
      const port = Number(process.env.CREWLIGHT_PORT ?? DEFAULT_DAEMON_PORT);
      return { host, port };
    },
    osNotifier: probeOsNotifier,
    claudeSnippet: () => setup.claudeCode,
    codexSnippet: () => setup.codex,
    codexHooksSetup: () => setup.codexHooks,
  };
}

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) {
    return {
      id: "node",
      status: "error",
      message: `Node.js ${version || "unknown"} is unsupported.`,
      action: "Install Node.js 22 or newer, then rebuild Crewlight.",
    };
  }

  return {
    id: "node",
    status: "ok",
    message: `Node.js ${version} is supported.`,
  };
}

function pnpmCheck(version: string | undefined): DoctorCheck {
  return version
    ? {
        id: "pnpm",
        status: "ok",
        message: `pnpm ${version} is available.`,
      }
    : {
        id: "pnpm",
        status: "warning",
        message: "pnpm was not found. Installed CLI usage can continue.",
        action: "For source builds, enable Corepack and install pnpm 10.11.0.",
      };
}

function setupChecks(runtime: DoctorRuntime): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  try {
    const parsed = JSON.parse(runtime.claudeSnippet()) as {
      hooks?: unknown;
    };
    checks.push(
      parsed.hooks
        ? {
            id: "setup-claude-code",
            status: "ok",
            message: "Claude Code setup snippet can be generated.",
          }
        : {
            id: "setup-claude-code",
            status: "error",
            message: "Claude Code setup snippet is missing its hooks object.",
            action: "Rebuild Crewlight and rerun `crewlight doctor`.",
          },
    );
  } catch {
    checks.push({
      id: "setup-claude-code",
      status: "error",
      message: "Claude Code setup snippet is not valid JSON.",
      action: "Rebuild Crewlight and rerun `crewlight doctor`.",
    });
  }

  const codexSnippet = runtime.codexSnippet();
  checks.push(
    /^notify = \[.+, "ingest", "codex"\]$/u.test(codexSnippet)
      ? {
          id: "setup-codex",
          status: "ok",
          message: "Codex setup snippet can be generated.",
        }
      : {
          id: "setup-codex",
          status: "error",
          message: "Codex setup snippet is invalid.",
          action: "Rebuild Crewlight and rerun `crewlight doctor`.",
        },
  );

  const codexHooksSetup = runtime.codexHooksSetup();
  if (!codexHooksSetup.available) {
    checks.push({
      id: "setup-codex-hooks",
      status: "warning",
      message: codexHooksSetup.reason.message,
      action: codexHooksSetup.reason.action,
    });
    return checks;
  }

  try {
    const parsed = JSON.parse(codexHooksSetup.snippet) as {
      hooks?: { Stop?: unknown };
    };
    checks.push(
      parsed.hooks?.Stop
        ? {
            id: "setup-codex-hooks",
            status: "ok",
            message: "Codex hooks setup snippet can be generated.",
          }
        : {
            id: "setup-codex-hooks",
            status: "error",
            message: "Codex hooks setup snippet is missing its Stop hook.",
            action: "Rebuild Crewlight and rerun `crewlight doctor`.",
          },
    );
  } catch {
    checks.push({
      id: "setup-codex-hooks",
      status: "error",
      message: "Codex hooks setup snippet is not valid JSON.",
      action: "Rebuild Crewlight and rerun `crewlight doctor`.",
    });
  }

  return checks;
}

async function notifierCheck(
  notifier: NotifierKind,
  runtime: DoctorRuntime,
): Promise<DoctorCheck> {
  if (notifier === "console") {
    return {
      id: "notifier",
      status: "ok",
      message: "Console notifier is available.",
    };
  }

  if (notifier === "none") {
    return {
      id: "notifier",
      status: "ok",
      message:
        "Notifier mode is `none`; notifications are intentionally disabled.",
    };
  }

  const result = await runtime.osNotifier();
  if (result.available) {
    return {
      id: "notifier",
      status: "ok",
      message:
        "OS notifier module loaded with a supported interface. Desktop delivery was not tested.",
    };
  }

  return {
    id: "notifier",
    status: "warning",
    message:
      result.reason === "import"
        ? "OS notifier module could not be loaded. Desktop notifications are unavailable."
        : "OS notifier module has an unsupported interface. Desktop notifications are unavailable.",
    action: "Use `crewlight daemon --notifier console` as a safe fallback.",
  };
}

function runtimeChecks(runtime: DoctorRuntime): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const env = runtime.daemonEnv();

  if (env.port !== DEFAULT_DAEMON_PORT) {
    checks.push({
      id: "daemon-port",
      status: "ok", // info
      message: `Daemon is configured to use a non-default port (${env.port}). Ensure ingest commands specify this port.`,
    });
  }

  if (
    env.host !== "127.0.0.1" &&
    env.host !== "::1" &&
    env.host !== "localhost"
  ) {
    checks.push({
      id: "daemon-host",
      status: "ok", // info
      message: `Daemon is listening on ${env.host}. Note that Codespaces/remote environments may require port forwarding configurations.`,
    });
  }

  const entry = runtime.entryPath();
  const pathResolved = runtime.pathResolvedCrewlight();
  if (
    entry &&
    pathResolved &&
    !entry.includes(pathResolved) &&
    !pathResolved.includes(entry)
  ) {
    checks.push({
      id: "cli-resolution",
      status: "warning",
      message: `The current process entry (${entry}) differs from the PATH-resolved crewlight (${pathResolved}).`,
      action:
        "Ensure your shell hooks and ingest commands invoke the intended Crewlight installation.",
    });
  } else if (pathResolved) {
    checks.push({
      id: "cli-resolution",
      status: "ok",
      message: `PATH-resolved crewlight: ${pathResolved}`,
    });
  }

  return checks;
}

async function capabilitiesChecks(
  runtime: DoctorRuntime,
  expectTaskTitles: string | undefined,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const caps = await runtime.dashboardCapabilities();
  if (!caps) {
    checks.push({
      id: "capabilities-endpoint",
      status: "error",
      message: "Crewlight capabilities endpoint is unreachable.",
      action: "Start `crewlight daemon` and ensure the dashboard is enabled.",
    });
    return checks;
  }
  checks.push({
    id: "capabilities-endpoint",
    status: "ok",
    message: "Crewlight capabilities endpoint is reachable.",
  });

  if (expectTaskTitles !== undefined) {
    if (caps.taskTitleMode === expectTaskTitles) {
      checks.push({
        id: "task-titles",
        status: "ok",
        message: `Task titles mode matches expectation (${expectTaskTitles}).`,
      });
    } else {
      checks.push({
        id: "task-titles",
        status: "warning",
        message: `Task titles mode is '${caps.taskTitleMode}', but expected '${expectTaskTitles}'.`,
        action: `Start daemon with \`--dashboard-task-titles ${expectTaskTitles}\`.`,
      });
    }
  } else {
    checks.push({
      id: "task-titles",
      status: "ok",
      message: `Task titles mode is: ${caps.taskTitleMode}. Run doctor with --expect-task-titles to verify expectations.`,
    });
  }

  return checks;
}

export async function runDoctor(
  notifier: NotifierKind,
  expectTaskTitles?: string,
  runtime: DoctorRuntime = createDoctorRuntime(),
): Promise<DoctorReport> {
  const standalone = runtime.standalone();
  const checks: DoctorCheck[] = [
    nodeCheck(runtime.nodeVersion()),
    standalone
      ? {
          id: "pnpm",
          status: "skipped",
          message: "pnpm is not required by the standalone binary.",
        }
      : pnpmCheck(runtime.pnpmVersion()),
    standalone
      ? {
          id: "cli-build",
          status: "ok",
          message: "Crewlight is running as a standalone binary.",
        }
      : (await runtime.cliBuilt())
        ? {
            id: "cli-build",
            status: "ok",
            message: "The current Crewlight CLI is running from built output.",
          }
        : {
            id: "cli-build",
            status: "error",
            message: "Crewlight CLI built output could not be verified.",
            action:
              "Run `pnpm build`, then invoke `node packages/cli/dist/index.js doctor`.",
          },
    ...runtimeChecks(runtime),
    (await runtime.daemonReachable())
      ? {
          id: "daemon",
          status: "ok",
          message: "Crewlight daemon endpoint is reachable.",
        }
      : {
          id: "daemon",
          status: "error",
          message:
            "Crewlight daemon endpoint is unreachable, so events cannot be recorded.",
          action:
            "Start `crewlight daemon --notifier console`, verify CREWLIGHT_HOST/PORT, then rerun doctor.",
        },
    ...(await capabilitiesChecks(runtime, expectTaskTitles)),
    await notifierCheck(notifier, runtime),
    ...setupChecks(runtime),
  ];

  return {
    ok: checks.every((check) => check.status !== "error"),
    checks,
  };
}

function writeHumanReport(report: DoctorReport, io: CommandIo): void {
  for (const check of report.checks) {
    const line = `[${check.status}] ${check.id}: ${check.message}`;
    if (check.status === "error" || check.status === "warning") {
      io.warn(line);
      if (check.action) {
        io.warn(`  Action: ${check.action}`);
      }
    } else {
      io.write(line);
    }
  }
}

export async function executeDoctorCommand(
  args: readonly string[],
  io: CommandIo,
  runtime: DoctorRuntime = createDoctorRuntime(),
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      json: { type: "boolean", default: false },
      notifier: { type: "string", default: "console" },
      "expect-task-titles": { type: "string" },
    },
    strict: true,
  });

  if (!isNotifierKind(values.notifier)) {
    throw new Error(`Invalid notifier kind: ${values.notifier}`);
  }

  const report = await runDoctor(
    values.notifier,
    values["expect-task-titles"],
    runtime,
  );
  if (values.json) {
    io.write(JSON.stringify(report, null, 2));
  } else {
    writeHumanReport(report, io);
  }

  return report.ok ? 0 : 1;
}
