export const COMPANION_STATUSES = [
  "idle",
  "running",
  "using_tool",
  "waiting_input",
  "waiting_permission",
  "completed",
  "failed",
  "rate_limited",
  "unknown",
] as const;

export type CompanionStatus = (typeof COMPANION_STATUSES)[number];
export type CompanionPriority =
  | "needs_action"
  | "error"
  | "stale"
  | "active"
  | "ready"
  | "hidden";
export type CompanionActionKind = "input" | "permission";

export interface SanitizedSession {
  viewId: string;
  sessionKey: string;
  source: string;
  surface: string;
  status: CompanionStatus;
  lastEventAt: number;
  lastEventAgeMs: number;
  durationMs: number;
  displayName: string;
  displayWorkspace: string;
  priority: CompanionPriority;
  visibleUntil?: number;
  taskTitle?: string;
  activityLabel?: string;
  actionKind?: CompanionActionKind;
  remoteAlias?: string;
}

type SanitizedSessionWithoutViewId = Omit<SanitizedSession, "viewId">;

const viewIdBySessionKey = new Map<string, string>();
let nextSessionViewId = 0;

function sessionViewId(sessionKey: string): string {
  const existing = viewIdBySessionKey.get(sessionKey);
  if (existing) {
    return existing;
  }
  const created = `session-${++nextSessionViewId}`;
  viewIdBySessionKey.set(sessionKey, created);
  return created;
}

function retainSessionViewIds(sessionKeys: ReadonlySet<string>): void {
  for (const sessionKey of viewIdBySessionKey.keys()) {
    if (!sessionKeys.has(sessionKey)) {
      viewIdBySessionKey.delete(sessionKey);
    }
  }
}

export interface SanitizedDashboardData {
  sessions: SanitizedSession[];
}

export interface SanitizedDashboardSnapshot extends SanitizedDashboardData {
  health: {
    status: "ok";
  };
  notifier?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, maximumLength);
}

function isStatus(value: unknown): value is CompanionStatus {
  return (
    typeof value === "string" &&
    (COMPANION_STATUSES as readonly string[]).includes(value)
  );
}

function isPriority(value: unknown): value is CompanionPriority {
  return (
    value === "needs_action" ||
    value === "error" ||
    value === "stale" ||
    value === "active" ||
    value === "ready" ||
    value === "hidden"
  );
}

function isActionKind(value: unknown): value is CompanionActionKind {
  return value === "input" || value === "permission";
}

function hasValidPresentationState(
  status: CompanionStatus,
  priority: CompanionPriority,
  actionKind: unknown,
  visibleUntil: unknown,
): boolean {
  if (
    visibleUntil !== undefined &&
    (status !== "completed" || priority !== "ready")
  ) {
    return false;
  }
  if (status === "waiting_input") {
    return priority === "needs_action" && actionKind === "input";
  }
  if (status === "waiting_permission") {
    return priority === "needs_action" && actionKind === "permission";
  }
  if (status === "completed") {
    return (
      (priority === "ready" || priority === "hidden") &&
      actionKind === undefined
    );
  }
  if (status === "failed" || status === "rate_limited") {
    return priority === "error" && actionKind === undefined;
  }
  if (status === "running" || status === "using_tool") {
    return (
      (priority === "active" || priority === "stale") &&
      actionKind === undefined
    );
  }
  return priority === "hidden" && actionKind === undefined;
}

function sanitizeSession(
  value: unknown,
): SanitizedSessionWithoutViewId | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const sessionKey = safeString(value.sessionKey, 240);
  const source = safeString(value.source, 48);
  const surface = safeString(value.surface, 48);
  const displayName = safeString(value.displayName, 80);
  const displayWorkspace = safeString(value.displayWorkspace, 120);

  if (
    !sessionKey ||
    !source ||
    !surface ||
    !displayName ||
    !displayWorkspace ||
    !isStatus(value.status) ||
    !Number.isFinite(value.lastEventAt) ||
    Number(value.lastEventAt) < 0 ||
    !Number.isFinite(value.lastEventAgeMs) ||
    Number(value.lastEventAgeMs) < 0 ||
    (value.durationMs !== undefined &&
      (!Number.isFinite(value.durationMs) || Number(value.durationMs) < 0)) ||
    !isPriority(value.priority) ||
    (value.visibleUntil !== undefined &&
      (!Number.isFinite(value.visibleUntil) ||
        Number(value.visibleUntil) < 0)) ||
    !hasValidPresentationState(
      value.status,
      value.priority,
      value.actionKind,
      value.visibleUntil,
    )
  ) {
    return undefined;
  }

  const lastEventAt = Number(value.lastEventAt);
  const lastEventAgeMs = Number(value.lastEventAgeMs);
  const durationMs =
    value.durationMs !== undefined ? Number(value.durationMs) : 0;
  const taskTitle = safeString(value.taskTitle, 120);
  const activityLabel = safeString(value.activityLabel, 120);
  const visibleUntil =
    value.visibleUntil !== undefined ? Number(value.visibleUntil) : undefined;
  const actionKind = isActionKind(value.actionKind)
    ? value.actionKind
    : undefined;
  let remoteAlias = safeString(value.remoteAlias, 64);
  if (remoteAlias && !/^[a-zA-Z0-9._-]+$/u.test(remoteAlias)) {
    remoteAlias = undefined;
  }

  return {
    sessionKey,
    source,
    surface,
    status: value.status,
    lastEventAt,
    lastEventAgeMs,
    durationMs,
    displayName,
    displayWorkspace,
    priority: value.priority,
    ...(visibleUntil !== undefined ? { visibleUntil } : {}),
    ...(taskTitle ? { taskTitle } : {}),
    ...(activityLabel ? { activityLabel } : {}),
    ...(actionKind ? { actionKind } : {}),
    ...(remoteAlias ? { remoteAlias } : {}),
  };
}

export function sanitizeDashboardResponse(
  value: unknown,
): SanitizedDashboardData | undefined {
  const snapshot = sanitizeDashboardSnapshot(value);
  return snapshot ? { sessions: snapshot.sessions } : undefined;
}

export function sanitizeDashboardSnapshot(
  value: unknown,
): SanitizedDashboardSnapshot | undefined {
  if (
    !isRecord(value) ||
    !isRecord(value.health) ||
    value.health.status !== "ok" ||
    !Array.isArray(value.sessions)
  ) {
    return undefined;
  }

  const sanitizedSessions = value.sessions.map(sanitizeSession);
  if (sanitizedSessions.some((session) => session === undefined)) {
    return undefined;
  }
  const completeSessions = sanitizedSessions as SanitizedSessionWithoutViewId[];
  retainSessionViewIds(
    new Set(completeSessions.map((session) => session.sessionKey)),
  );
  const sessions = completeSessions.map((session) => ({
    ...session,
    viewId: sessionViewId(session.sessionKey),
  }));

  const notifier = safeString(value.notifier, 24);
  return {
    health: { status: "ok" },
    ...(notifier ? { notifier } : {}),
    sessions,
  };
}
