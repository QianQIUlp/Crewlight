import { parseArgs } from "node:util";

import {
  AgentPulseService,
  formatDaemonUrl,
  resolveDaemonConfig,
  startDaemon,
} from "@agentpulse/daemon";
import { createNotifier } from "@agentpulse/notifier";

import { createDoctorRuntime, runDoctor } from "./doctor.js";
import { CLAUDE_CODE_SETUP_SNIPPET, CODEX_SETUP_SNIPPET } from "./setup.js";
import type { CommandIo } from "./types.js";

export async function executeDaemonCommand(
  args: readonly string[],
  io: CommandIo,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      dashboard: { type: "boolean", default: false },
      host: { type: "string" },
      notifier: { type: "string" },
      port: { type: "string" },
    },
    strict: true,
  });
  const config = resolveDaemonConfig({
    ...(values.host ? { host: values.host } : {}),
    ...(values.notifier ? { notifier: values.notifier } : {}),
    ...(values.port ? { port: Number(values.port) } : {}),
  });
  const service = new AgentPulseService({
    notifier: createNotifier(config.notifier, {
      warning: io.warn,
    }),
  });
  let doctorReport: ReturnType<typeof runDoctor> | undefined;
  const dashboard = values.dashboard
    ? {
        notifier: config.notifier,
        setup: {
          claudeCode: CLAUDE_CODE_SETUP_SNIPPET,
          codex: CODEX_SETUP_SNIPPET,
        },
        doctor: () => {
          doctorReport ??= runDoctor(
            config.notifier,
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
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
        io.write("AgentPulse daemon stopped");
        resolve(0);
      }, reject);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}
