import { parseArgs } from "node:util";

import {
  AgentPulseService,
  formatDaemonUrl,
  isLoopbackHost,
  resolveDaemonConfig,
  startDaemon,
  type DaemonConfig,
  type DashboardTaskTitleMode,
} from "@agentpulse/daemon";
import { createNotifier } from "@agentpulse/notifier";

import { createDoctorRuntime, runDoctor } from "./doctor.js";
import {
  createAntigravityProbeCommand,
  createSetupSnippets,
  formatCodexHooksSetup,
} from "./setup.js";
import type { CommandIo } from "./types.js";

export interface DaemonCommandOptions {
  config: DaemonConfig;
  dashboard: boolean;
  dashboardTaskTitleMode: DashboardTaskTitleMode;
}

export function resolveDaemonCommandOptions(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): DaemonCommandOptions {
  const { values } = parseArgs({
    args: [...args],
    options: {
      dashboard: { type: "boolean", default: false },
      "dashboard-task-titles": { type: "string" },
      host: { type: "string" },
      notifier: { type: "string" },
      port: { type: "string" },
    },
    strict: true,
  });
  const config = resolveDaemonConfig(
    {
      ...(values.host !== undefined ? { host: values.host } : {}),
      ...(values.notifier !== undefined ? { notifier: values.notifier } : {}),
      ...(values.port !== undefined ? { port: Number(values.port) } : {}),
    },
    env,
  );
  const requestedTaskTitleMode = values["dashboard-task-titles"];
  if (
    requestedTaskTitleMode !== undefined &&
    requestedTaskTitleMode !== "prompt-preview"
  ) {
    throw new Error(
      "Unsupported --dashboard-task-titles value. Use `prompt-preview`.",
    );
  }
  const dashboardTaskTitleMode: DashboardTaskTitleMode =
    requestedTaskTitleMode ?? "off";

  if (dashboardTaskTitleMode !== "off" && !values.dashboard) {
    throw new Error(
      "`--dashboard-task-titles prompt-preview` requires `--dashboard`.",
    );
  }

  if (values.dashboard && !isLoopbackHost(config.host)) {
    throw new Error(
      "The AgentPulse dashboard requires --host 127.0.0.1 or --host ::1.",
    );
  }

  return {
    config,
    dashboard: values.dashboard,
    dashboardTaskTitleMode,
  };
}

export async function executeDaemonCommand(
  args: readonly string[],
  io: CommandIo,
): Promise<number> {
  const options = resolveDaemonCommandOptions(args);
  const { config } = options;
  const service = new AgentPulseService({
    notifier: createNotifier(config.notifier, {
      warning: io.warn,
    }),
  });
  let doctorReport: ReturnType<typeof runDoctor> | undefined;
  const setup = createSetupSnippets();
  const dashboard = options.dashboard
    ? {
        notifier: config.notifier,
        taskTitleMode: options.dashboardTaskTitleMode,
        setup: {
          claudeCode: setup.claudeCode,
          codex: setup.codex,
          codexHooks: formatCodexHooksSetup(setup.codexHooks),
          cursor: setup.cursor,
          openCode: setup.openCode,
          antigravityProbe: createAntigravityProbeCommand(),
          verification: {
            claudeCode: setup.verification.claudeCode,
            codex: setup.verification.codex,
            cursor: setup.verification.cursor,
            antigravityProbe: createAntigravityProbeCommand(),
          },
        },
        doctor: () => {
          doctorReport ??= runDoctor(
            config.notifier,
            undefined,
            createDoctorRuntime({
              baseUrl: formatDaemonUrl(config.host, config.port),
            }),
          );
          return doctorReport;
        },
      }
    : undefined;
  let daemon;
  try {
    daemon = await startDaemon(config, service, dashboard ? { dashboard } : {});
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ) {
      throw new Error(
        `Cannot start AgentPulse: ${config.host}:${config.port} is already in use. Stop the process using that port, or choose another port with \`agentpulse daemon --port <port>\` and set AGENTPULSE_PORT to the same value for clients.`,
      );
    }
    throw error;
  }

  io.write(
    `AgentPulse daemon listening at ${daemon.url} (notifier: ${config.notifier})`,
  );
  if (dashboard) {
    io.write(`AgentPulse dashboard: ${daemon.url}/dashboard`);
  }
  if (config.notifier === "os") {
    io.write(
      "OS notification failures will not stop ingestion. Fallback: restart with `agentpulse daemon --notifier console`.",
    );
  }

  return new Promise<number>((resolve, reject) => {
    let closing = false;

    const shutdown = () => {
      if (closing) {
        return;
      }
      closing = true;
      void daemon.close().then(() => {
        removeSignalHandlers();
        io.write("AgentPulse daemon stopped");
        resolve(0);
      }, reject);
    };

    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    if (process.platform === "win32") {
      signals.push("SIGBREAK");
    }
    for (const signal of signals) {
      process.on(signal, shutdown);
    }

    const removeSignalHandlers = () => {
      for (const signal of signals) {
        process.off(signal, shutdown);
      }
    };
  });
}
