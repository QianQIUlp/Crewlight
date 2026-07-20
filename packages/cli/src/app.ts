import { DaemonClient } from "./daemon-client.js";
import { executeDaemonCommand } from "./commands/daemon.js";
import { executeDemoCommand } from "./commands/demo.js";
import { executeDoctorCommand } from "./commands/doctor.js";
import { executeEmitCommand } from "./commands/emit.js";
import { executeIngestCommand } from "./commands/ingest.js";
import { executeRunCommand } from "./commands/run.js";
import { executeSetupCommand } from "./commands/setup.js";
import { executeStatusCommand } from "./commands/status.js";
import { consoleIo, readStdin, type CommandIo } from "./commands/types.js";

const USAGE = `Crewlight v0.5.0

Usage:
  crewlight daemon [--host HOST] [--port PORT] [--notifier KIND] [--dashboard] [--dashboard-task-titles prompt-preview]
  crewlight demo [multi-agent]
  crewlight demo --scenario multi-agent
  crewlight doctor [--json] [--notifier KIND]
  crewlight emit --source SOURCE --surface SURFACE --status STATUS [options]
  crewlight ingest claude-code
  crewlight ingest codex [json]
  crewlight ingest codex-hook [--hook EVENT] [--surface unknown|cli|desktop]
  crewlight ingest cursor [--event EVENT] [--surface ide-extension|desktop|manual] [--session ID] [--workspace NAME] [--project PATH] [--title TITLE] [--message MESSAGE] [--timestamp MS]
  crewlight ingest opencode-plugin [--event EVENT]
  crewlight ingest antigravity-probe [--event EVENT] [--surface unknown|cli|desktop]
  crewlight setup claude-code --print [--binary PATH]
  crewlight setup codex --print [--binary PATH]
  crewlight setup codex-hooks --print [--binary PATH] [--surface unknown|cli|desktop]
  crewlight setup cursor --print [--binary PATH]
  crewlight setup gemini-cli --print [--binary PATH]
  crewlight setup opencode --print [--binary PATH]
  crewlight status [--json]
  crewlight run [--source generic-cli] [--cwd PATH] -- <command> [args...]
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
      case "demo":
        return await executeDemoCommand(commandArgs, new DaemonClient(), io);
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
