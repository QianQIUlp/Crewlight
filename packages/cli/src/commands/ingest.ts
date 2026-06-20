import { ingestClaudeHookJson } from "@agentpulse/adapter-claude-code";
import {
  ingestCodexHookJson,
  ingestCodexNotifyJson,
} from "@agentpulse/adapter-codex";

import type { AgentPulseClient } from "../daemon-client.js";
import type { CommandIo, StdinReader } from "./types.js";

const WARNING_PREFIX = "AgentPulse ingest warning:";
const CODEX_HOOK_NOOP_RESPONSE = '{"continue":true}';

function warn(io: CommandIo, message: string): void {
  io.warn(`${WARNING_PREFIX} ${message}`);
}

function warnAdapterResult(
  io: CommandIo,
  result: { kind: "ignored" | "invalid"; reason: string },
): void {
  if (result.kind === "invalid") {
    warn(
      io,
      `${result.reason}. No event was recorded. Verify the platform setup and run \`agentpulse doctor\`.`,
    );
    return;
  }

  warn(
    io,
    `${result.reason}. No event was recorded because this payload is not supported. Check the supported events in the setup docs; the host workflow will continue.`,
  );
}

async function deliver(
  json: string,
  adapter:
    | typeof ingestClaudeHookJson
    | typeof ingestCodexNotifyJson
    | typeof ingestCodexHookJson,
  client: AgentPulseClient,
  io: CommandIo,
): Promise<number> {
  const result = adapter(json);

  if (result.kind !== "event") {
    warnAdapterResult(io, result);
    return 0;
  }

  try {
    await client.emit(result.event);
  } catch {
    warn(
      io,
      "unable to deliver the event, so it was not recorded. Start the daemon with `agentpulse daemon --notifier console`, then run `agentpulse doctor`. The host workflow will continue.",
    );
  }

  return 0;
}

async function ingestCodexHook(
  platformArgs: readonly string[],
  client: AgentPulseClient,
  io: CommandIo,
  readStdin: StdinReader,
): Promise<number> {
  try {
    if (platformArgs.length === 0) {
      const result = ingestCodexHookJson(await readStdin());
      if (result.kind === "event") {
        try {
          await client.emit(result.event);
        } catch {
          // Codex hooks must remain non-blocking when the daemon is unavailable.
        }
      }
    }
  } catch {
    // Invalid or unreadable hook input must not interrupt Codex.
  }

  io.write(CODEX_HOOK_NOOP_RESPONSE);
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
      warn(
        io,
        "Claude Code ingest accepts JSON on stdin only. No event was recorded. Regenerate the hook with `agentpulse setup claude-code --print`.",
      );
      return 0;
    }

    return deliver(await readStdin(), ingestClaudeHookJson, client, io);
  }

  if (platform === "codex") {
    if (platformArgs.length > 1) {
      warn(
        io,
        "Codex ingest accepts one JSON argument or stdin. No event was recorded. Regenerate the notify snippet with `agentpulse setup codex --print`.",
      );
      return 0;
    }

    const json = platformArgs[0] ?? (await readStdin());
    return deliver(json, ingestCodexNotifyJson, client, io);
  }

  if (platform === "codex-hook") {
    return ingestCodexHook(platformArgs, client, io, readStdin);
  }

  warn(
    io,
    "unsupported platform. No event was recorded. Use `claude-code`, `codex`, or `codex-hook`, then run `agentpulse doctor`.",
  );
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
    warn(
      io,
      "unable to read platform input, so no event was recorded. Verify the generated setup snippet and run `agentpulse doctor`; the host workflow will continue.",
    );
    return 0;
  }
}
