import { ingestClaudeHookJson } from "@crewlight/adapter-claude-code";
import {
  ingestCodexHookJson,
  ingestCodexNotifyJson,
  isCodexHookEventName,
  type CodexHookEventName,
} from "@crewlight/adapter-codex";
import {
  ingestCursorBridgeJson,
  mapCursorBridgeEvent,
  type CursorAdapterResult,
} from "@crewlight/adapter-cursor";
import {
  ingestOpenCodePluginJson,
  isOpenCodeEventType,
} from "@crewlight/adapter-opencode";
import type { AgentEventInput, AgentSurface } from "@crewlight/core";

import type { CrewlightClient } from "../daemon-client.js";
import type { CommandIo, StdinReader } from "./types.js";

const WARNING_PREFIX = "Crewlight ingest warning:";
type ProbeSurface = Extract<AgentSurface, "unknown" | "cli" | "desktop">;
type IngestAdapter = (
  json: string,
) =>
  | ReturnType<typeof ingestClaudeHookJson>
  | ReturnType<typeof ingestCodexNotifyJson>
  | ReturnType<typeof ingestCodexHookJson>
  | ReturnType<typeof ingestCursorBridgeJson>;

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
      `${result.reason}. No event was recorded. Verify the platform setup and run \`crewlight doctor\`.`,
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
  adapter: IngestAdapter,
  client: CrewlightClient,
  io: CommandIo,
): Promise<number> {
  return deliverAdapterResult(adapter(json), client, io);
}

async function deliverAdapterResult(
  result: CursorAdapterResult | ReturnType<IngestAdapter>,
  client: CrewlightClient,
  io: CommandIo,
): Promise<number> {
  if (result.kind !== "event") {
    warnAdapterResult(io, result);
    return 0;
  }

  try {
    await client.emit(result.event);
  } catch {
    warn(
      io,
      "unable to deliver the event, so it was not recorded. Start the daemon with `crewlight daemon --notifier console`, then run `crewlight doctor`. The host workflow will continue.",
    );
  }

  return 0;
}

async function ingestCursor(
  platformArgs: readonly string[],
  client: CrewlightClient,
  io: CommandIo,
  readStdin: StdinReader,
): Promise<number> {
  if (platformArgs.length === 0) {
    return deliver(await readStdin(), ingestCursorBridgeJson, client, io);
  }

  const options = parseUniqueOptions(platformArgs, [
    "--event",
    "--surface",
    "--session",
    "--workspace",
    "--project",
    "--title",
    "--message",
    "--timestamp",
  ]);
  if (!options || options["--event"] === undefined) {
    warn(
      io,
      "Cursor ingest requires JSON on stdin or a unique `--event` flag with supported options. No event was recorded.",
    );
    return 0;
  }

  const timestampValue = options["--timestamp"];
  const result = mapCursorBridgeEvent({
    event: options["--event"],
    ...(options["--surface"] ? { surface: options["--surface"] } : {}),
    ...(options["--session"] ? { sessionId: options["--session"] } : {}),
    ...(options["--workspace"]
      ? { workspaceName: options["--workspace"] }
      : {}),
    ...(options["--project"] ? { projectPath: options["--project"] } : {}),
    ...(options["--title"] ? { title: options["--title"] } : {}),
    ...(options["--message"] ? { message: options["--message"] } : {}),
    ...(timestampValue !== undefined
      ? { timestamp: Number(timestampValue) }
      : {}),
  });
  return deliverAdapterResult(result, client, io);
}

function hookEventNameFromJson(json: string): string | undefined {
  try {
    return safeText(asRecord(JSON.parse(json))?.hook_event_name);
  } catch {
    return undefined;
  }
}

async function promptPreviewEnabled(
  client: CrewlightClient,
  hookEventName: string | undefined,
): Promise<boolean> {
  if (
    hookEventName !== "UserPromptSubmit" ||
    client.dashboardCapabilities === undefined
  ) {
    return false;
  }

  try {
    return (
      (await client.dashboardCapabilities()).taskTitleMode === "prompt-preview"
    );
  } catch {
    return false;
  }
}

async function ingestCodexHook(
  platformArgs: readonly string[],
  client: CrewlightClient,
  readStdin: StdinReader,
): Promise<number> {
  const options = parseUniqueOptions(platformArgs, ["--hook", "--surface"]);
  if (!options) {
    return 0;
  }

  const hookArg = options["--hook"];
  const hookSelection:
    | { kind: "stdin" }
    | { kind: "override"; hook: CodexHookEventName }
    | { kind: "ignore" } =
    hookArg === undefined
      ? { kind: "stdin" }
      : isCodexHookEventName(hookArg)
        ? { kind: "override", hook: hookArg }
        : { kind: "ignore" };
  const surface = parseProbeSurface(options["--surface"]);

  if (hookSelection.kind === "ignore" || !surface) {
    return 0;
  }

  let json = "";
  try {
    json = await readStdin();
  } catch {
    if (hookSelection.kind === "stdin") {
      return 0;
    }
  }

  try {
    const hookEventName =
      hookSelection.kind === "override"
        ? hookSelection.hook
        : hookEventNameFromJson(json);
    const promptPreview = await promptPreviewEnabled(client, hookEventName);
    const result = ingestCodexHookJson(
      json,
      hookSelection.kind === "override" ? hookSelection.hook : undefined,
      surface,
      { promptPreview },
    );
    if (result.kind === "event") {
      try {
        await client.emit(result.event);
      } catch {
        // Codex hooks must remain non-blocking when the daemon is unavailable.
      }
    }
  } catch {
    // Invalid hook input must not interrupt Codex.
  }

  return 0;
}

function parseUniqueOptions(
  args: readonly string[],
  allowed: readonly string[],
): Record<string, string> | undefined {
  if (args.length % 2 !== 0) {
    return undefined;
  }

  const result: Record<string, string> = {};
  const allowedSet = new Set(allowed);
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      !option ||
      !value ||
      !allowedSet.has(option) ||
      result[option] !== undefined
    ) {
      return undefined;
    }
    result[option] = value;
  }
  return result;
}

function parseProbeSurface(
  value: string | undefined,
): ProbeSurface | undefined {
  if (value === undefined) {
    return "unknown";
  }
  return value === "unknown" || value === "cli" || value === "desktop"
    ? value
    : undefined;
}

async function deliverSilently(
  event: AgentEventInput | undefined,
  client: CrewlightClient,
): Promise<number> {
  if (!event) {
    return 0;
  }

  try {
    await client.emit(event);
  } catch {
    // Platform hooks and probes must not block when the daemon is unavailable.
  }
  return 0;
}

async function ingestOpenCodePlugin(
  platformArgs: readonly string[],
  client: CrewlightClient,
  readStdin: StdinReader,
): Promise<number> {
  const options = parseUniqueOptions(platformArgs, ["--event"]);
  const eventOverride = options?.["--event"];
  if (
    !options ||
    (eventOverride !== undefined && !isOpenCodeEventType(eventOverride))
  ) {
    return 0;
  }

  let json = "";
  try {
    json = await readStdin();
  } catch {
    // An explicit event can still produce a safe best-effort observation.
  }

  try {
    const result = ingestOpenCodePluginJson(json, eventOverride);
    return deliverSilently(
      result.kind === "event" ? result.event : undefined,
      client,
    );
  } catch {
    return 0;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function safeTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function antigravityProbeEvent(
  input: unknown,
  eventOverride: string | undefined,
  surface: ProbeSurface,
): AgentEventInput | undefined {
  const payload = asRecord(input);
  const event = asRecord(payload?.event);
  const properties = asRecord(event?.properties);
  const info = asRecord(properties?.info);
  const eventType = eventOverride ?? safeText(event?.type);
  if (!eventType) {
    return undefined;
  }

  const sessionId =
    safeText(payload?.sessionId) ??
    safeText(payload?.sessionID) ??
    safeText(payload?.session_id) ??
    safeText(properties?.sessionID) ??
    safeText(properties?.sessionId) ??
    safeText(info?.id);
  const projectPath =
    safeText(payload?.cwd) ??
    safeText(payload?.directory) ??
    safeText(payload?.projectPath);
  const timestamp =
    safeTimestamp(payload?.timestamp) ??
    safeTimestamp(event?.timestamp) ??
    safeTimestamp(properties?.timestamp);

  return {
    source: "antigravity",
    surface,
    status: "unknown",
    title: eventType,
    message: "Antigravity probe event observed",
    ...(sessionId ? { sessionId } : {}),
    ...(projectPath ? { projectPath } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  };
}

async function ingestAntigravityProbe(
  platformArgs: readonly string[],
  client: CrewlightClient,
  readStdin: StdinReader,
): Promise<number> {
  const options = parseUniqueOptions(platformArgs, ["--event", "--surface"]);
  const surface = options ? parseProbeSurface(options["--surface"]) : undefined;
  if (!options || !surface) {
    return 0;
  }

  let input: unknown;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    // Missing and malformed probe input are intentionally ignored.
  }

  try {
    return deliverSilently(
      antigravityProbeEvent(input, safeText(options["--event"]), surface),
      client,
    );
  } catch {
    return 0;
  }
}

async function ingest(
  args: readonly string[],
  client: CrewlightClient,
  io: CommandIo,
  readStdin: StdinReader,
): Promise<number> {
  const [platform, ...platformArgs] = args;

  if (platform === "claude-code") {
    if (platformArgs.length > 0) {
      warn(
        io,
        "Claude Code ingest accepts JSON on stdin only. No event was recorded. Regenerate the hook with `crewlight setup claude-code --print`.",
      );
      return 0;
    }

    const json = await readStdin();
    const promptPreview = await promptPreviewEnabled(
      client,
      hookEventNameFromJson(json),
    );
    return deliver(
      json,
      (input) => ingestClaudeHookJson(input, { promptPreview }),
      client,
      io,
    );
  }

  if (platform === "codex") {
    if (platformArgs.length > 1) {
      warn(
        io,
        "Codex ingest accepts one JSON argument or stdin. No event was recorded. Regenerate the notify snippet with `crewlight setup codex --print`.",
      );
      return 0;
    }

    const json = platformArgs[0] ?? (await readStdin());
    return deliver(json, ingestCodexNotifyJson, client, io);
  }

  if (platform === "codex-hook") {
    return ingestCodexHook(platformArgs, client, readStdin);
  }

  if (platform === "cursor") {
    return ingestCursor(platformArgs, client, io, readStdin);
  }

  if (platform === "opencode-plugin") {
    return ingestOpenCodePlugin(platformArgs, client, readStdin);
  }

  if (platform === "antigravity-probe") {
    return ingestAntigravityProbe(platformArgs, client, readStdin);
  }

  warn(
    io,
    "unsupported platform. No event was recorded. Use `claude-code`, `codex`, `codex-hook`, `cursor`, `opencode-plugin`, or `antigravity-probe`, then run `crewlight doctor`.",
  );
  return 0;
}

export async function executeIngestCommand(
  args: readonly string[],
  client: CrewlightClient,
  io: CommandIo,
  readStdin: StdinReader,
): Promise<number> {
  try {
    return await ingest(args, client, io, readStdin);
  } catch {
    warn(
      io,
      "unable to read platform input, so no event was recorded. Verify the generated setup snippet and run `crewlight doctor`; the host workflow will continue.",
    );
    return 0;
  }
}
