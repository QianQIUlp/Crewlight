import { basename } from "node:path";

import type {
  AgentEventInput,
  AgentSource,
  AgentStatus,
} from "@crewlight/core";

export interface CommandEventContext {
  commandText: string;
  projectPath: string;
  sessionId: string;
  source: AgentSource;
  startedAt: number;
}

function quoteArgument(argument: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(argument)
    ? argument
    : JSON.stringify(argument);
}

export function formatCommand(
  command: string,
  args: readonly string[],
): string {
  return [command, ...args].map(quoteArgument).join(" ");
}

export function createCommandEvent(
  context: CommandEventContext,
  status: AgentStatus,
  message: string,
  timestamp: number,
): AgentEventInput {
  return {
    source: context.source,
    surface: "cli",
    sessionId: context.sessionId,
    projectPath: context.projectPath,
    workspaceName: basename(context.projectPath),
    status,
    title: `Command ${status}`,
    message,
    timestamp,
  };
}

export function createRunningMessage(_context: CommandEventContext): string {
  return "Command started";
}

export function createCompletedMessage(
  _context: CommandEventContext,
  durationMs: number,
): string {
  return `Command completed; exitCode=0; durationMs=${durationMs}`;
}

export function createFailedMessage(
  _context: CommandEventContext,
  details: {
    durationMs: number;
    exitCode?: number;
    signal?: NodeJS.Signals;
    spawnError?: string;
  },
): string {
  const result = details.spawnError
    ? "exitCode=unavailable; signal=unavailable; spawnError=command_start_failed"
    : details.signal
      ? `signal=${details.signal}`
      : `exitCode=${details.exitCode ?? "unknown"}`;

  return `Command failed; ${result}; durationMs=${details.durationMs}`;
}
