import { parseArgs } from "node:util";

import {
  AgentPulseService,
  resolveDaemonConfig,
  startDaemon,
} from "@agentpulse/daemon";
import { createNotifier } from "@agentpulse/notifier";

import type { CommandIo } from "./types.js";

export async function executeDaemonCommand(
  args: readonly string[],
  io: CommandIo,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
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
  const daemon = await startDaemon(config, service);

  io.write(`AgentPulse daemon listening at ${daemon.url}`);

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
