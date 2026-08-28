import type { AgentEvent, AgentSession, AgentStatus } from "./types.js";

const ACTIVE_STATUSES = new Set<AgentStatus>([
  "running",
  "using_tool",
  "waiting_input",
  "waiting_permission",
]);

const TERMINAL_LIKE_STATUSES = new Set<AgentStatus>([
  "completed",
  "failed",
  "rate_limited",
]);
const TERMINAL_HIDING_STATUSES = new Set<AgentStatus>(["idle", "unknown"]);
const RECENT_EVENT_ID_LIMIT = 32;
const DEFAULT_SESSION_LIMIT = 1_000;
const DEFAULT_STABLE_EVENT_ID_LIMIT = 100_000;
const STABLE_EVENT_ID_PREFIX = "stable:";

export interface SessionApplyResult {
  applied: boolean;
  session: AgentSession;
}

export interface SessionStoreOptions {
  sessionLimit?: number;
  stableEventIdLimit?: number;
}

export class SessionStore {
  readonly #recentEventIds = new Map<string, string[]>();
  readonly #sessions = new Map<string, AgentSession>();
  readonly #sessionLimit: number;
  readonly #stableEventIdLimit: number;
  readonly #stableEventIds = new Map<string, Set<string>>();
  #stableEventIdCount = 0;

  constructor(options: SessionStoreOptions = {}) {
    this.#sessionLimit = positiveIntegerOption(
      options.sessionLimit,
      DEFAULT_SESSION_LIMIT,
      "sessionLimit",
    );
    this.#stableEventIdLimit = positiveIntegerOption(
      options.stableEventIdLimit,
      DEFAULT_STABLE_EVENT_ID_LIMIT,
      "stableEventIdLimit",
    );
  }

  apply(event: AgentEvent): AgentSession {
    return this.applyWithResult(event).session;
  }

  applyWithResult(event: AgentEvent): SessionApplyResult {
    const current = this.#sessions.get(event.sessionKey);
    const recentEventIds = this.#recentEventIds.get(event.sessionKey);
    const stableEventIds = this.#stableEventIds.get(event.sessionKey);
    const stableEventId = isStableEventId(event.id);

    if (
      current &&
      ((stableEventId
        ? stableEventIds?.has(event.id) === true
        : recentEventIds?.includes(event.id) === true) ||
        event.timestamp < current.lastEventAt ||
        (TERMINAL_LIKE_STATUSES.has(current.status) &&
          TERMINAL_HIDING_STATUSES.has(event.status)))
    ) {
      return { applied: false, session: current };
    }

    const active = ACTIVE_STATUSES.has(event.status);
    const terminal = TERMINAL_LIKE_STATUSES.has(event.status);
    const reopening = Boolean(
      current && active && TERMINAL_LIKE_STATUSES.has(current.status),
    );
    const enteringTerminal =
      terminal && (current === undefined || current.status !== event.status);

    const session: AgentSession = {
      sessionKey: event.sessionKey,
      source: event.source,
      surface: event.surface,
      status: event.status,
      lastEventAt: event.timestamp,
      ...((event.sessionId ?? current?.sessionId)
        ? { sessionId: event.sessionId ?? current?.sessionId }
        : {}),
      ...((event.projectPath ?? current?.projectPath)
        ? { projectPath: event.projectPath ?? current?.projectPath }
        : {}),
      ...((event.workspaceName ?? current?.workspaceName)
        ? { workspaceName: event.workspaceName ?? current?.workspaceName }
        : {}),
      ...((event.taskTitle ?? current?.taskTitle)
        ? { taskTitle: event.taskTitle ?? current?.taskTitle }
        : {}),
      ...(event.title ? { title: event.title } : {}),
      ...((event.message ?? current?.lastMessage)
        ? { lastMessage: event.message ?? current?.lastMessage }
        : {}),
      ...((event.remoteAlias ?? current?.remoteAlias)
        ? { remoteAlias: event.remoteAlias ?? current?.remoteAlias }
        : {}),
      ...(active
        ? {
            startedAt: reopening
              ? event.timestamp
              : (current?.startedAt ?? event.timestamp),
          }
        : current?.startedAt !== undefined
          ? { startedAt: current.startedAt }
          : {}),
      ...(enteringTerminal
        ? { completedAt: event.timestamp }
        : !active && current?.completedAt !== undefined
          ? { completedAt: current.completedAt }
          : {}),
      ...(event.status === "failed"
        ? { error: event.message ?? event.title ?? "Agent failed" }
        : event.status === "rate_limited"
          ? {
              error: event.message ?? event.title ?? "Agent rate limited",
            }
          : !active && event.status !== "completed" && current?.error
            ? { error: current.error }
            : {}),
    };

    this.#sessions.set(event.sessionKey, session);
    if (stableEventId) {
      const nextStableEventIds = stableEventIds ?? new Set<string>();
      if (!nextStableEventIds.has(event.id)) {
        nextStableEventIds.add(event.id);
        this.#stableEventIdCount += 1;
      }
      this.#stableEventIds.set(event.sessionKey, nextStableEventIds);
    } else {
      const nextEventIds = [...(recentEventIds ?? []), event.id];
      if (nextEventIds.length > RECENT_EVENT_ID_LIMIT) {
        nextEventIds.splice(0, nextEventIds.length - RECENT_EVENT_ID_LIMIT);
      }
      this.#recentEventIds.set(event.sessionKey, nextEventIds);
    }
    this.#evictToLimits(event.sessionKey);
    return { applied: true, session };
  }

  #evictToLimits(justWrittenSessionKey: string): void {
    while (this.#sessions.size > this.#sessionLimit) {
      const oldestSessionKey = this.#oldestSessionKey(justWrittenSessionKey);
      if (oldestSessionKey === undefined) {
        break;
      }
      this.#deleteSession(oldestSessionKey);
    }

    while (this.#stableEventIdCount > this.#stableEventIdLimit) {
      const oldestSessionKey = this.#oldestSessionKey(
        justWrittenSessionKey,
        (sessionKey) => (this.#stableEventIds.get(sessionKey)?.size ?? 0) > 0,
      );
      if (oldestSessionKey === undefined) {
        break;
      }
      this.#deleteSession(oldestSessionKey);
    }
  }

  #oldestSessionKey(
    justWrittenSessionKey: string,
    include: (sessionKey: string) => boolean = () => true,
  ): string | undefined {
    let oldestEntry: [string, AgentSession] | undefined;
    for (const entry of this.#sessions.entries()) {
      if (!include(entry[0])) {
        continue;
      }
      if (
        oldestEntry === undefined ||
        isOlderForEviction(entry, oldestEntry, justWrittenSessionKey)
      ) {
        oldestEntry = entry;
      }
    }

    return oldestEntry?.[0];
  }

  #deleteSession(sessionKey: string): void {
    this.#sessions.delete(sessionKey);
    this.#recentEventIds.delete(sessionKey);
    const stableEventIds = this.#stableEventIds.get(sessionKey);
    if (stableEventIds !== undefined) {
      this.#stableEventIdCount -= stableEventIds.size;
      this.#stableEventIds.delete(sessionKey);
    }
  }

  get(sessionKey: string): AgentSession | undefined {
    return this.#sessions.get(sessionKey);
  }

  list(): AgentSession[] {
    return [...this.#sessions.values()].sort((left, right) => {
      if (left.lastEventAt !== right.lastEventAt) {
        return right.lastEventAt - left.lastEventAt;
      }
      return compareSessionKeys(left.sessionKey, right.sessionKey);
    });
  }
}

function positiveIntegerOption(
  value: number | undefined,
  defaultValue: number,
  name: string,
): number {
  const resolved = value ?? defaultValue;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function isStableEventId(eventId: string): boolean {
  return eventId.startsWith(STABLE_EVENT_ID_PREFIX);
}

function isOlderForEviction(
  candidate: [string, AgentSession],
  currentOldest: [string, AgentSession],
  justWrittenSessionKey: string,
): boolean {
  const [candidateKey, candidateSession] = candidate;
  const [currentKey, currentSession] = currentOldest;

  if (candidateSession.lastEventAt !== currentSession.lastEventAt) {
    return candidateSession.lastEventAt < currentSession.lastEventAt;
  }

  const candidateWasJustWritten = candidateKey === justWrittenSessionKey;
  const currentWasJustWritten = currentKey === justWrittenSessionKey;
  if (candidateWasJustWritten !== currentWasJustWritten) {
    return !candidateWasJustWritten;
  }

  return compareSessionKeys(candidateKey, currentKey) < 0;
}

function compareSessionKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
