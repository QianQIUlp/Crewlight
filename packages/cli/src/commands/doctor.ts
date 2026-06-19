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
} from "@agentpulse/notifier";

import { DaemonClient } from "../daemon-client.js";
import { CLAUDE_CODE_SETUP_SNIPPET, CODEX_SETUP_SNIPPET } from "./setup.js";
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
  osNotifier(): Promise<OsNotifierProbeResult>;
  claudeSnippet(): string;
  codexSnippet(): string;
}

export interface DoctorRuntimeOptions {
  baseUrl?: string;
}

export function createDoctorRuntime(
  options: DoctorRuntimeOptions = {},
): DoctorRuntime {
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
        await new DaemonClient(
          options.baseUrl ? { baseUrl: options.baseUrl } : {},
        ).sessions();
        return true;
      } catch {
        return false;
      }
    },
    osNotifier: probeOsNotifier,
    claudeSnippet: () => CLAUDE_CODE_SETUP_SNIPPET,
    codexSnippet: () => CODEX_SETUP_SNIPPET,
  };
}

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.split(".")[0]);
  if (!Number.isInteger(major) || major < 22) {
    return {
      id: "node",
      status: "error",
      message: `Node.js ${version || "unknown"} is unsupported.`,
      action: "Install Node.js 22 or newer, then rebuild AgentPulse.",
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
            action: "Rebuild AgentPulse and rerun `agentpulse doctor`.",
          },
    );
  } catch {
    checks.push({
      id: "setup-claude-code",
      status: "error",
      message: "Claude Code setup snippet is not valid JSON.",
      action: "Rebuild AgentPulse and rerun `agentpulse doctor`.",
    });
  }

  const codexSnippet = runtime.codexSnippet();
  checks.push(
    codexSnippet === 'notify = ["agentpulse", "ingest", "codex"]'
      ? {
          id: "setup-codex",
          status: "ok",
          message: "Codex setup snippet can be generated.",
        }
      : {
          id: "setup-codex",
          status: "error",
          message: "Codex setup snippet is invalid.",
          action: "Rebuild AgentPulse and rerun `agentpulse doctor`.",
        },
  );

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
    action: "Use `agentpulse daemon --notifier console` as a safe fallback.",
  };
}

export async function runDoctor(
  notifier: NotifierKind,
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
          message: "AgentPulse is running as a standalone binary.",
        }
      : (await runtime.cliBuilt())
        ? {
            id: "cli-build",
            status: "ok",
            message: "The current AgentPulse CLI is running from built output.",
          }
        : {
            id: "cli-build",
            status: "error",
            message: "AgentPulse CLI built output could not be verified.",
            action:
              "Run `pnpm build`, then invoke `node packages/cli/dist/index.js doctor`.",
          },
    (await runtime.daemonReachable())
      ? {
          id: "daemon",
          status: "ok",
          message: "AgentPulse daemon endpoint is reachable.",
        }
      : {
          id: "daemon",
          status: "error",
          message:
            "AgentPulse daemon endpoint is unreachable, so events cannot be recorded.",
          action:
            "Start `agentpulse daemon --notifier console`, verify AGENTPULSE_HOST/PORT, then rerun doctor.",
        },
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
    },
    strict: true,
  });

  if (!isNotifierKind(values.notifier)) {
    throw new Error(`Invalid notifier kind: ${values.notifier}`);
  }

  const report = await runDoctor(values.notifier, runtime);
  if (values.json) {
    io.write(JSON.stringify(report, null, 2));
  } else {
    writeHumanReport(report, io);
  }

  return report.ok ? 0 : 1;
}
