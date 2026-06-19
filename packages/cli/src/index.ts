#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DaemonClient } from "./daemon-client.js";
import { executeDaemonCommand } from "./commands/daemon.js";
import { executeEmitCommand } from "./commands/emit.js";
import { executeRunCommand } from "./commands/run.js";
import { executeStatusCommand } from "./commands/status.js";
import { consoleIo, type CommandIo } from "./commands/types.js";

const USAGE = `AgentPulse v0.1

Usage:
  agentpulse daemon [--host HOST] [--port PORT]
  agentpulse emit --source SOURCE --surface SURFACE --status STATUS [options]
  agentpulse status [--json]
  agentpulse run [--source generic-cli] [--cwd PATH] -- <command> [args...]
`;

export async function main(
  args: readonly string[] = process.argv.slice(2),
  io: CommandIo = consoleIo,
): Promise<number> {
  const [command, ...commandArgs] = args;

  try {
    switch (command) {
      case "daemon":
        return await executeDaemonCommand(commandArgs, io);
      case "emit":
        return await executeEmitCommand(commandArgs, new DaemonClient(), io);
      case "status":
        return await executeStatusCommand(commandArgs, new DaemonClient(), io);
      case "run":
        return await executeRunCommand(commandArgs, new DaemonClient(), io);
      case "--help":
      case "-h":
      case undefined:
        io.write(USAGE);
        return 0;
      default:
        throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
    }
  } catch (error) {
    io.warn(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function isMainModule(
  moduleUrl: string,
  entryPath: string | undefined,
): boolean {
  if (!entryPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entryPath);
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  process.exitCode = await main();
}

export { DaemonClient } from "./daemon-client.js";
export type { AgentPulseClient } from "./daemon-client.js";
