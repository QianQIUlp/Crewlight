import { constants as osConstants } from "node:os";
import { parseArgs } from "node:util";

import { runCommand } from "@crewlight/adapter-generic-cli";
import { agentSourceSchema } from "@crewlight/core";

import type { CrewlightClient } from "../daemon-client.js";
import type { CommandIo } from "./types.js";

function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + (osConstants.signals[signal] ?? 1);
}

export async function executeRunCommand(
  args: readonly string[],
  client: CrewlightClient,
  io: CommandIo,
): Promise<number> {
  const separator = args.indexOf("--");
  if (separator === -1) {
    throw new Error("run requires -- before the command");
  }

  const optionArgs = args.slice(0, separator);
  const commandArgs = args.slice(separator + 1);
  const command = commandArgs[0];
  if (!command) {
    throw new Error("run requires a command after --");
  }

  const { values } = parseArgs({
    args: optionArgs,
    options: {
      cwd: { type: "string" },
      source: { type: "string", default: "generic-cli" },
    },
    strict: true,
  });
  const source = agentSourceSchema.parse(values.source);
  if (source !== "generic-cli") {
    throw new Error("crewlight run supports only --source generic-cli");
  }

  const result = await runCommand({
    command,
    args: commandArgs.slice(1),
    ...(values.cwd ? { cwd: values.cwd } : {}),
    source,
    emit: async (event) => {
      io.write(`[Crewlight] ${event.status}: ${event.message ?? ""}`);
      await client.emit(event);
    },
    onEmitError: (error, event) => {
      const message = error instanceof Error ? error.message : String(error);
      io.warn(
        `[Crewlight] warning: could not deliver ${event.status} event: ${message}`,
      );
    },
  });

  if (result.exitCode !== null) {
    return result.exitCode;
  }
  if (result.signal) {
    return signalExitCode(result.signal);
  }
  return 1;
}
