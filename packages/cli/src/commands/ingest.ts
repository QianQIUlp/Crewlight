import { ingestClaudeHookJson } from "@agentpulse/adapter-claude-code";
import { ingestCodexNotifyJson } from "@agentpulse/adapter-codex";

import type { AgentPulseClient } from "../daemon-client.js";
import type { CommandIo, StdinReader } from "./types.js";

const WARNING_PREFIX = "AgentPulse ingest warning:";

function warn(io: CommandIo, message: string): void {
  io.warn(`${WARNING_PREFIX} ${message}`);
}

async function deliver(
  json: string,
  adapter: typeof ingestClaudeHookJson | typeof ingestCodexNotifyJson,
  client: AgentPulseClient,
  io: CommandIo,
): Promise<number> {
  const result = adapter(json);

  if (result.kind !== "event") {
    warn(io, result.reason);
    return 0;
  }

  try {
    await client.emit(result.event);
  } catch {
    warn(io, "unable to deliver event to the AgentPulse daemon");
  }

  return 0;
}

async function ingest(
  args: readonly string[],
  client: AgentPulseClient,
  io: CommandIo,
  readStdin: StdinReader,
): Promise<number> {
  const [platform, ...platformArgs] = args;

  if (platform === "claude-code") {
    if (platformArgs.length > 0) {
      warn(io, "Claude Code ingest accepts JSON on stdin only");
      return 0;
    }

    return deliver(await readStdin(), ingestClaudeHookJson, client, io);
  }

  if (platform === "codex") {
    if (platformArgs.length > 1) {
      warn(io, "Codex ingest accepts one JSON argument or stdin");
      return 0;
    }

    const json = platformArgs[0] ?? (await readStdin());
    return deliver(json, ingestCodexNotifyJson, client, io);
  }

  warn(io, "unsupported platform");
  return 0;
}

export async function executeIngestCommand(
  args: readonly string[],
  client: AgentPulseClient,
  io: CommandIo,
  readStdin: StdinReader,
): Promise<number> {
  try {
    return await ingest(args, client, io, readStdin);
  } catch {
    warn(io, "unable to read platform input");
    return 0;
  }
}
