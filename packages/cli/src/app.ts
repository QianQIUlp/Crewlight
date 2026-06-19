import { DaemonClient } from "./daemon-client.js";
import { executeDaemonCommand } from "./commands/daemon.js";
import { executeDoctorCommand } from "./commands/doctor.js";
import { executeEmitCommand } from "./commands/emit.js";
import { executeIngestCommand } from "./commands/ingest.js";
import { executeRunCommand } from "./commands/run.js";
import { executeSetupCommand } from "./commands/setup.js";
import { executeStatusCommand } from "./commands/status.js";
import { consoleIo, readStdin, type CommandIo } from "./commands/types.js";

const USAGE = `AgentPulse v0.2.2

Usage:
  agentpulse daemon [--host HOST] [--port PORT] [--notifier KIND] [--dashboard]
  agentpulse doctor [--json] [--notifier KIND]
  agentpulse emit --source SOURCE --surface SURFACE --status STATUS [options]
  agentpulse ingest claude-code
  agentpulse ingest codex [json]
  agentpulse setup claude-code --print
  agentpulse setup codex --print
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
      case "doctor":
        return await executeDoctorCommand(commandArgs, io);
      case "emit":
        return await executeEmitCommand(commandArgs, new DaemonClient(), io);
      case "ingest":
        return await executeIngestCommand(
          commandArgs,
          new DaemonClient(),
          io,
          readStdin,
        );
      case "setup":
        return executeSetupCommand(commandArgs, io);
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
