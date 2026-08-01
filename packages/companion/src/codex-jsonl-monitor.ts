import { createHash } from "node:crypto";
import { open, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  mapCodexJsonlLine,
  stableCodexTurnEventId,
  type CrewlightClient,
} from "@crewlight/cli";

type AgentEventInput = Parameters<CrewlightClient["emit"]>[0];
type AgentStatus = AgentEventInput["status"];
type AgentSurface = AgentEventInput["surface"];

export const CODEX_JSONL_POLL_INTERVAL_MS = 1_500;
export const CODEX_JSONL_ACTIVE_WINDOW_MS = 5 * 60_000;

const FULL_DISCOVERY_INTERVAL_MS = 60_000;
const ACTIVITY_HEARTBEAT_MS = 30_000;
const TRACKED_FILE_RETENTION_MS = 30 * 60_000;
const MAX_TRACKED_FILES = 50;
const MAX_DISCOVERY_DAY_DIRECTORIES = 730;
const MAX_FILES_PER_DAY_DIRECTORY = 512;
const RECENT_DAY_DIRECTORY_COUNT = 7;
const HEAD_READ_LIMIT_BYTES = 128 * 1_024;
const TAIL_READ_LIMIT_BYTES = 1_024 * 1_024;
const READ_CHUNK_BYTES = 512 * 1_024;
const MAX_JSONL_LINE_BYTES = 512 * 1_024;
const ROLLOUT_FILE_PATTERN =
  /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/iu;

interface FileInfo {
  mtimeMs: number;
  path: string;
  size: number;
}

interface DecodedLine {
  endOffset: number;
  value: Buffer;
}

interface EventCandidate {
  endOffset: number;
  status: AgentStatus;
  timestamp: number;
  turnId?: string;
}

interface ParsedLine {
  candidate?: EventCandidate;
  metadataChanged: boolean;
}

interface TrackedFile {
  discardingOversizedLine: boolean;
  lastFingerprint?: string;
  lastMtimeMs: number;
  lastPublishedAt?: number;
  lastStatus?: AgentStatus;
  latestEvent?: AgentEventInput;
  readOffset: number;
  partial: Buffer;
  path: string;
  projectPath?: string;
  sessionId: string;
  surface: AgentSurface;
}

export interface CodexJsonlMonitorOptions {
  activeWindowMs?: number;
  now?: () => number;
  pollIntervalMs?: number;
  publish(event: AgentEventInput): Promise<void> | void;
  sessionsDirectory: string;
}

export interface CodexJsonlMonitor {
  pollOnce(): Promise<boolean>;
  replayLatest(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
}

export interface CodexSessionsDirectoryOptions {
  codexHome?: string;
  homeDirectory: string;
}

function requireAbsoluteDirectory(path: string, label: string): string {
  if (!path || path.includes("\0") || !isAbsolute(path)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return resolve(path);
}

export function resolveCodexSessionsDirectory(
  options: CodexSessionsDirectoryOptions,
): string {
  const homeDirectory = requireAbsoluteDirectory(
    options.homeDirectory,
    "homeDirectory",
  );
  const codexHome = requireAbsoluteDirectory(
    options.codexHome ?? join(homeDirectory, ".codex"),
    "codexHome",
  );
  return join(codexHome, "sessions");
}

function positiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive number.`);
  }
  return value;
}

function sessionIdFromFile(path: string): string | undefined {
  return ROLLOUT_FILE_PATTERN.exec(path.split(/[\\/]/u).at(-1) ?? "")?.[1];
}

function stableEventId(sessionId: string, candidate: EventCandidate): string {
  if (candidate.status === "completed" && candidate.turnId) {
    return stableCodexTurnEventId(sessionId, candidate.turnId);
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "codex-jsonl",
        sessionId,
        candidate.endOffset,
        candidate.timestamp,
        candidate.status,
      ]),
    )
    .digest("hex")
    .slice(0, 24);
  return `stable:codex-jsonl:${digest}`;
}

async function readRange(
  path: string,
  position: number,
  length: number,
): Promise<Buffer> {
  if (length <= 0) {
    return Buffer.alloc(0);
  }
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function decodeChunk(
  tracked: TrackedFile,
  chunk: Buffer,
  chunkOffset: number,
  skipLeadingPartial = false,
): DecodedLine[] {
  let input = chunk;
  let inputOffset = chunkOffset;

  if (tracked.discardingOversizedLine) {
    const newline = input.indexOf(0x0a);
    if (newline < 0) {
      return [];
    }
    input = input.subarray(newline + 1);
    inputOffset += newline + 1;
    tracked.discardingOversizedLine = false;
  }

  const partialLength = tracked.partial.length;
  const combined = partialLength
    ? Buffer.concat([tracked.partial, input])
    : input;
  const combinedOffset = partialLength
    ? inputOffset - partialLength
    : inputOffset;
  tracked.partial = Buffer.alloc(0);

  let cursor = 0;
  if (skipLeadingPartial) {
    const firstNewline = combined.indexOf(0x0a);
    if (firstNewline < 0) {
      return [];
    }
    cursor = firstNewline + 1;
  }

  const lines: DecodedLine[] = [];
  for (;;) {
    const newline = combined.indexOf(0x0a, cursor);
    if (newline < 0) {
      break;
    }
    let value = combined.subarray(cursor, newline);
    if (value.at(-1) === 0x0d) {
      value = value.subarray(0, -1);
    }
    if (value.length > 0 && value.length <= MAX_JSONL_LINE_BYTES) {
      lines.push({
        endOffset: combinedOffset + newline + 1,
        value,
      });
    }
    cursor = newline + 1;
  }

  const remainder = combined.subarray(cursor);
  if (remainder.length > MAX_JSONL_LINE_BYTES) {
    tracked.discardingOversizedLine = true;
  } else if (remainder.length > 0) {
    tracked.partial = Buffer.from(remainder);
  }
  return lines;
}

function parseLine(
  tracked: TrackedFile,
  line: DecodedLine,
  fallbackTimestamp: number,
  now: number,
): ParsedLine {
  const mapped = mapCodexJsonlLine(line.value.toString("utf8"), {
    fallbackTimestamp,
    now,
  });
  if (!mapped) {
    return { metadataChanged: false };
  }

  let metadataChanged = false;
  if (mapped.projectPath && mapped.projectPath !== tracked.projectPath) {
    tracked.projectPath = mapped.projectPath;
    metadataChanged = true;
  }
  return {
    metadataChanged,
    ...(mapped.status && mapped.timestamp !== undefined
      ? {
          candidate: {
            endOffset: line.endOffset,
            status: mapped.status,
            timestamp: mapped.timestamp,
            ...(mapped.turnId ? { turnId: mapped.turnId } : {}),
          },
        }
      : {}),
  };
}

async function safeDirectoryEntries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function discoverDayDirectories(
  baseDirectory: string,
): Promise<string[]> {
  const years = (await safeDirectoryEntries(baseDirectory))
    .filter((entry) => entry.isDirectory() && /^\d{4}$/u.test(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name));
  const result: string[] = [];
  for (const year of years) {
    const yearPath = join(baseDirectory, year.name);
    const months = (await safeDirectoryEntries(yearPath))
      .filter((entry) => entry.isDirectory() && /^\d{2}$/u.test(entry.name))
      .sort((left, right) => right.name.localeCompare(left.name));
    for (const month of months) {
      const monthPath = join(yearPath, month.name);
      const days = (await safeDirectoryEntries(monthPath))
        .filter((entry) => entry.isDirectory() && /^\d{2}$/u.test(entry.name))
        .sort((left, right) => right.name.localeCompare(left.name));
      for (const day of days) {
        result.push(join(monthPath, day.name));
        if (result.length >= MAX_DISCOVERY_DAY_DIRECTORIES) {
          return result;
        }
      }
    }
  }
  return result;
}

async function scanDayDirectories(
  paths: readonly string[],
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  for (const dayDirectory of paths) {
    const entries = (await safeDirectoryEntries(dayDirectory))
      .filter(
        (entry) => entry.isFile() && ROLLOUT_FILE_PATTERN.test(entry.name),
      )
      .sort((left, right) => right.name.localeCompare(left.name))
      .slice(0, MAX_FILES_PER_DAY_DIRECTORY);
    for (const entry of entries) {
      const path = join(dayDirectory, entry.name);
      try {
        const metadata = await stat(path);
        if (metadata.isFile()) {
          files.push({
            mtimeMs: metadata.mtimeMs,
            path,
            size: metadata.size,
          });
        }
      } catch {}
    }
  }
  return files;
}

function deduplicateFiles(files: readonly FileInfo[]): FileInfo[] {
  const byPath = new Map<string, FileInfo>();
  for (const file of files) {
    const current = byPath.get(file.path);
    if (!current || file.mtimeMs > current.mtimeMs) {
      byPath.set(file.path, file);
    }
  }
  return [...byPath.values()];
}

export function createCodexJsonlMonitor(
  options: CodexJsonlMonitorOptions,
): CodexJsonlMonitor {
  const sessionsDirectory = requireAbsoluteDirectory(
    options.sessionsDirectory,
    "sessionsDirectory",
  );
  const now = options.now ?? Date.now;
  const pollIntervalMs = positiveNumber(
    options.pollIntervalMs ?? CODEX_JSONL_POLL_INTERVAL_MS,
    "pollIntervalMs",
  );
  const activeWindowMs = positiveNumber(
    options.activeWindowMs ?? CODEX_JSONL_ACTIVE_WINDOW_MS,
    "activeWindowMs",
  );
  const trackedFiles = new Map<string, TrackedFile>();
  let cachedDayDirectories: string[] = [];
  let lastFullDiscoveryAt = Number.NEGATIVE_INFINITY;
  let initialPollComplete = false;
  let polling: Promise<boolean> | undefined;
  let replaying: Promise<void> | undefined;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function publishCandidate(
    tracked: TrackedFile,
    candidate: EventCandidate,
    force = false,
  ): Promise<void> {
    const fingerprint = JSON.stringify([
      candidate.status,
      tracked.surface,
      tracked.projectPath ?? null,
    ]);
    const heartbeatDue =
      tracked.lastPublishedAt === undefined ||
      candidate.timestamp - tracked.lastPublishedAt >= ACTIVITY_HEARTBEAT_MS;
    if (
      !force &&
      isCoalescibleActivityStatus(candidate.status) &&
      fingerprint === tracked.lastFingerprint &&
      !heartbeatDue
    ) {
      return;
    }

    const event: AgentEventInput = {
      id: stableEventId(tracked.sessionId, candidate),
      source: "codex",
      surface: tracked.surface,
      sessionId: tracked.sessionId,
      status: candidate.status,
      timestamp: candidate.timestamp,
      ...(tracked.projectPath ? { projectPath: tracked.projectPath } : {}),
    };
    tracked.lastStatus = candidate.status;
    tracked.latestEvent = event;
    if (stopped) {
      return;
    }
    try {
      await options.publish(event);
      if (!stopped) {
        tracked.lastFingerprint = fingerprint;
        tracked.lastPublishedAt = candidate.timestamp;
      }
    } catch {
      // The monitor retains the latest allowlisted event so a daemon reconnect
      // can replay it. Source workflows must never fail because Crewlight is down.
    }
  }

  function isSustainedActiveStatus(status: AgentStatus): boolean {
    return (
      status === "running" ||
      status === "using_tool" ||
      status === "waiting_input" ||
      status === "waiting_permission"
    );
  }

  function isCoalescibleActivityStatus(status: AgentStatus): boolean {
    return status === "running" || status === "using_tool";
  }

  function enforceTrackedFileLimit(): void {
    if (trackedFiles.size <= MAX_TRACKED_FILES) {
      return;
    }
    const retained = new Set(
      [...trackedFiles.values()]
        .sort((left, right) => right.lastMtimeMs - left.lastMtimeMs)
        .slice(0, MAX_TRACKED_FILES)
        .map((tracked) => tracked.path),
    );
    for (const path of trackedFiles.keys()) {
      if (!retained.has(path)) {
        trackedFiles.delete(path);
      }
    }
  }

  async function initializeTrackedFile(
    file: FileInfo,
    bootstrap: boolean,
  ): Promise<TrackedFile | undefined> {
    const sessionId = sessionIdFromFile(file.path);
    if (!sessionId) {
      return undefined;
    }
    const tracked: TrackedFile = {
      discardingOversizedLine: false,
      lastMtimeMs: file.mtimeMs,
      readOffset: file.size,
      partial: Buffer.alloc(0),
      path: file.path,
      sessionId,
      // Existing Codex hooks and notify ingestion use the CLI surface. Keeping
      // the JSONL fallback aligned prevents one platform session from splitting
      // into two Crewlight cards solely because the source channel differs.
      surface: "cli",
    };
    let metadataOffset: number | undefined;
    let metadataTimestamp = file.mtimeMs;

    if (file.size > 0) {
      try {
        const head = await readRange(
          file.path,
          0,
          Math.min(file.size, HEAD_READ_LIMIT_BYTES),
        );
        const newline = head.indexOf(0x0a);
        if (newline >= 0) {
          const parsed = parseLine(
            tracked,
            { endOffset: newline + 1, value: head.subarray(0, newline) },
            file.mtimeMs,
            now(),
          );
          if (parsed.metadataChanged) {
            metadataOffset = newline + 1;
            metadataTimestamp = file.mtimeMs;
          }
        }
      } catch {
        return undefined;
      }
    }

    let latestCandidate: EventCandidate | undefined;
    if (file.size > 0) {
      const tailStart = Math.max(0, file.size - TAIL_READ_LIMIT_BYTES);
      const readStart = tailStart > 0 ? tailStart - 1 : 0;
      try {
        const tail = await readRange(
          file.path,
          readStart,
          file.size - readStart,
        );
        const startsAtBoundary = tailStart === 0 || tail[0] === 0x0a;
        const body = tailStart > 0 ? tail.subarray(1) : tail;
        for (const line of decodeChunk(
          tracked,
          body,
          tailStart,
          !startsAtBoundary,
        )) {
          const parsed = parseLine(tracked, line, file.mtimeMs, now());
          if (parsed.metadataChanged) {
            metadataOffset = line.endOffset;
            metadataTimestamp = file.mtimeMs;
          }
          if (parsed.candidate) {
            latestCandidate = parsed.candidate;
          }
        }
      } catch {
        return undefined;
      }
    }

    if (!latestCandidate && metadataOffset !== undefined) {
      latestCandidate = {
        endOffset: metadataOffset,
        status: "idle",
        timestamp: Math.min(Math.trunc(metadataTimestamp), Math.trunc(now())),
      };
    }
    if (latestCandidate) {
      tracked.lastStatus = latestCandidate.status;
      if (!bootstrap || isSustainedActiveStatus(latestCandidate.status)) {
        await publishCandidate(tracked, latestCandidate);
      }
    }
    return tracked;
  }

  async function updateTrackedFile(
    tracked: TrackedFile,
    file: FileInfo,
  ): Promise<TrackedFile | undefined> {
    if (file.size < tracked.readOffset) {
      return await initializeTrackedFile(file, false);
    }
    tracked.lastMtimeMs = file.mtimeMs;
    if (file.size === tracked.readOffset) {
      return tracked;
    }

    let latestCandidate: EventCandidate | undefined;
    let metadataChangedAt: number | undefined;
    let position = tracked.readOffset;
    while (position < file.size) {
      const length = Math.min(READ_CHUNK_BYTES, file.size - position);
      let chunk: Buffer;
      try {
        chunk = await readRange(file.path, position, length);
      } catch {
        return tracked;
      }
      if (chunk.length === 0) {
        break;
      }
      for (const line of decodeChunk(tracked, chunk, position)) {
        const parsed = parseLine(tracked, line, file.mtimeMs, now());
        if (parsed.metadataChanged) {
          metadataChangedAt = line.endOffset;
        }
        if (parsed.candidate) {
          latestCandidate = parsed.candidate;
        }
      }
      position += chunk.length;
      tracked.readOffset = position;
    }

    if (
      !latestCandidate &&
      metadataChangedAt !== undefined &&
      tracked.lastStatus &&
      isSustainedActiveStatus(tracked.lastStatus)
    ) {
      latestCandidate = {
        endOffset: metadataChangedAt,
        status: tracked.lastStatus,
        timestamp: Math.min(Math.trunc(file.mtimeMs), Math.trunc(now())),
      };
    }
    if (latestCandidate) {
      await publishCandidate(tracked, latestCandidate);
    }
    return tracked;
  }

  async function currentFileCandidates(
    currentTime: number,
  ): Promise<FileInfo[]> {
    const fullDiscoveryDue =
      cachedDayDirectories.length === 0 ||
      currentTime - lastFullDiscoveryAt >= FULL_DISCOVERY_INTERVAL_MS;
    let discovered: FileInfo[];
    if (fullDiscoveryDue) {
      const allDayDirectories = await discoverDayDirectories(sessionsDirectory);
      discovered = await scanDayDirectories(allDayDirectories);
      const activeDirectories = new Set(
        discovered
          .filter((file) => currentTime - file.mtimeMs <= activeWindowMs)
          .map((file) => dirname(file.path)),
      );
      cachedDayDirectories = [
        ...new Set([
          ...allDayDirectories.slice(0, RECENT_DAY_DIRECTORY_COUNT),
          ...activeDirectories,
        ]),
      ];
      lastFullDiscoveryAt = currentTime;
    } else {
      discovered = await scanDayDirectories(cachedDayDirectories);
    }

    const tracked = await Promise.all(
      [...trackedFiles.keys()].map(
        async (path): Promise<FileInfo | undefined> => {
          try {
            const metadata = await stat(path);
            return metadata.isFile()
              ? { mtimeMs: metadata.mtimeMs, path, size: metadata.size }
              : undefined;
          } catch {
            return undefined;
          }
        },
      ),
    );
    return deduplicateFiles([
      ...discovered.filter(
        (file) => currentTime - file.mtimeMs <= activeWindowMs,
      ),
      ...tracked.filter((file): file is FileInfo => file !== undefined),
    ])
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, MAX_TRACKED_FILES);
  }

  async function runPoll(): Promise<boolean> {
    const currentTime = now();
    const candidates = await currentFileCandidates(currentTime);
    const retainedPaths = new Set(candidates.map((file) => file.path));
    for (const file of candidates) {
      const current = trackedFiles.get(file.path);
      const next = current
        ? await updateTrackedFile(current, file)
        : await initializeTrackedFile(file, !initialPollComplete);
      if (next) {
        trackedFiles.set(file.path, next);
      }
    }

    for (const [path, tracked] of trackedFiles) {
      if (
        !retainedPaths.has(path) &&
        currentTime - tracked.lastMtimeMs > TRACKED_FILE_RETENTION_MS
      ) {
        trackedFiles.delete(path);
      }
    }
    enforceTrackedFileLimit();
    initialPollComplete = true;
    return true;
  }

  function pollOnce(): Promise<boolean> {
    if (stopped || polling) {
      return Promise.resolve(false);
    }
    const operation = runPoll().catch(() => false);
    polling = operation;
    void operation.finally(() => {
      if (polling === operation) {
        polling = undefined;
      }
    });
    return operation;
  }

  async function runReplayLatest(): Promise<void> {
    const events = [...trackedFiles.values()]
      .flatMap((tracked) => (tracked.latestEvent ? [tracked.latestEvent] : []))
      .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));
    for (const event of events) {
      if (stopped) {
        return;
      }
      try {
        await options.publish(event);
        const tracked = [...trackedFiles.values()].find(
          (candidate) => candidate.latestEvent === event,
        );
        if (tracked && !stopped) {
          tracked.lastFingerprint = JSON.stringify([
            event.status,
            event.surface,
            event.projectPath ?? null,
          ]);
          tracked.lastPublishedAt = event.timestamp;
        }
      } catch {}
    }
  }

  function replayLatest(): Promise<void> {
    if (stopped) {
      return Promise.resolve();
    }
    if (replaying) {
      return replaying;
    }
    const operation = runReplayLatest();
    replaying = operation;
    void operation.finally(() => {
      if (replaying === operation) {
        replaying = undefined;
      }
    });
    return operation;
  }

  return {
    pollOnce,
    replayLatest,
    start: () => {
      if (timer) {
        return;
      }
      stopped = false;
      void pollOnce();
      timer = setInterval(() => {
        void pollOnce();
      }, pollIntervalMs);
      timer.unref?.();
    },
    stop: async () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
      await Promise.all([
        polling?.catch(() => false),
        replaying?.catch(() => undefined),
      ]);
    },
  };
}
