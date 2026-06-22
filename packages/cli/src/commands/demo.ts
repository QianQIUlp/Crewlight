import { parseArgs } from "node:util";

import type { AgentEventInput } from "@agentpulse/core";
import { formatDaemonUrl } from "@agentpulse/daemon";
import { DEFAULT_DAEMON_HOST, DEFAULT_DAEMON_PORT } from "@agentpulse/shared";

import type { AgentPulseClient } from "../daemon-client.js";
import type { CommandIo } from "./types.js";

export type DemoScenario = "multi-agent";

export interface DemoCommandOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

const DEMO_WORKSPACE = "AgentPulse Demo";
const DEMO_EVENT_COUNT = 6;

export function resolveDemoScenario(args: readonly string[]): DemoScenario {
  const { positionals, values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      scenario: { type: "string" },
    },
    strict: true,
  });

  if (positionals.length > 1) {
    throw new Error("agentpulse demo accepts only one scenario name");
  }
  if (positionals[0] !== undefined && values.scenario !== undefined) {
    throw new Error(
      "Choose the demo scenario either positionally or with --scenario, not both",
    );
  }

  const scenario = positionals[0] ?? values.scenario ?? "multi-agent";
  if (scenario !== "multi-agent") {
    throw new Error(
      `Unknown demo scenario: ${scenario}. Available scenario: multi-agent`,
    );
  }
  return scenario;
}

export function createMultiAgentDemoEvents(
  now: number = Date.now(),
): AgentEventInput[] {
  return [
    {
      source: "claude-code",
      surface: "cli",
      sessionId: "demo:claude-code:tests",
      workspaceName: DEMO_WORKSPACE,
      status: "using_tool",
      taskTitle: "[Demo] Running AgentPulse tests",
      title: "DemoClaudeTests",
      timestamp: now - 5_000,
    },
    {
      source: "codex",
      surface: "cli",
      sessionId: "demo:codex:readme-permission",
      workspaceName: DEMO_WORKSPACE,
      status: "waiting_permission",
      taskTitle: "[Demo] Updating README",
      title: "DemoCodexPermission",
      timestamp: now - 12_000,
    },
    {
      source: "cursor",
      surface: "ide-extension",
      sessionId: "demo:cursor:review",
      workspaceName: DEMO_WORKSPACE,
      status: "waiting_input",
      taskTitle: "[Demo] Reviewing companion UI",
      title: "DemoCursorReview",
      timestamp: now - 20_000,
    },
    {
      source: "opencode",
      surface: "cli",
      sessionId: "demo:opencode:complete",
      workspaceName: DEMO_WORKSPACE,
      status: "completed",
      taskTitle: "[Demo] Adapter smoke check",
      title: "DemoOpenCodeComplete",
      timestamp: now - 45_000,
    },
    {
      source: "custom",
      surface: "manual",
      sessionId: "demo:custom:setup-failure",
      workspaceName: DEMO_WORKSPACE,
      status: "failed",
      taskTitle: "[Demo] Local setup validation",
      title: "DemoCustomSetupFailed",
      timestamp: now - 90_000,
    },
    {
      source: "generic-cli",
      surface: "cli",
      sessionId: "demo:generic-cli:stale-scan",
      workspaceName: DEMO_WORKSPACE,
      status: "running",
      taskTitle: "[Demo] Background dependency scan",
      title: "DemoGenericStaleScan",
      timestamp: now - 6 * 60 * 1_000,
    },
  ];
}

export function getDemoDashboardUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const host = env.AGENTPULSE_HOST ?? DEFAULT_DAEMON_HOST;
  const port = Number(env.AGENTPULSE_PORT ?? DEFAULT_DAEMON_PORT);
  return `${formatDaemonUrl(host, port)}/dashboard`;
}

export async function executeDemoCommand(
  args: readonly string[],
  client: AgentPulseClient,
  io: CommandIo,
  options: DemoCommandOptions = {},
): Promise<number> {
  const scenario = resolveDemoScenario(args);

  try {
    await client.sessions();
  } catch {
    io.warn(
      "AgentPulse demo warning: cannot reach the local daemon. Start `agentpulse daemon --dashboard --notifier none`, then rerun `agentpulse demo multi-agent`.",
    );
    return 1;
  }

  const events = createMultiAgentDemoEvents((options.now ?? Date.now)());
  let delivered = 0;
  for (const event of events) {
    try {
      await client.emit(event);
      delivered += 1;
    } catch {
      io.warn(
        `AgentPulse demo warning: stopped after ${delivered} of ${DEMO_EVENT_COUNT} synthetic events. Check the daemon, then rerun \`agentpulse demo multi-agent\`.`,
      );
      return 1;
    }
  }

  io.write(`Loaded ${delivered} synthetic sessions for ${scenario}.`);
  io.write(`Dashboard: ${getDemoDashboardUrl(options.env)}`);
  io.write("Companion (source checkout): pnpm companion:dev");
  io.write("Refresh demo sessions: agentpulse demo multi-agent");
  io.write(
    "Clear demo sessions: restart the AgentPulse daemon; all sessions are in memory.",
  );
  io.write(
    "These sessions are synthetic local demo data; no real agent telemetry was used.",
  );
  return 0;
}
