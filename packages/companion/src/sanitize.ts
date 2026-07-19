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
export type CompanionAttention = "passive" | "done" | "action" | "error";
export type CompanionActionKind = "input" | "permission";

export interface SanitizedSession {
  sessionKey: string;
  source: string;
  surface: string;
  status: CompanionStatus;
  lastEventAt: number;
  lastEventAgeMs: number;
  durationMs: number;
  isStale: boolean;
  displayName: string;
  displayWorkspace: string;
  attention: CompanionAttention;
  taskTitle?: string;
  activityLabel?: string;
  staleReason?: string;
  actionKind?: CompanionActionKind;
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

function isAttention(value: unknown): value is CompanionAttention {
  return (
    value === "passive" ||
    value === "done" ||
    value === "action" ||
    value === "error"
  );
}

function isActionKind(value: unknown): value is CompanionActionKind {
  return value === "input" || value === "permission";
}

function hasValidPresentationState(
  status: CompanionStatus,
  attention: CompanionAttention,
  actionKind: unknown,
): boolean {
  if (status === "waiting_input") {
    return attention === "action" && actionKind === "input";
  }
  if (status === "waiting_permission") {
    return attention === "action" && actionKind === "permission";
  }
  if (status === "completed") {
    return attention === "done" && actionKind === undefined;
  }
  if (status === "failed" || status === "rate_limited") {
    return attention === "error" && actionKind === undefined;
  }
  return attention === "passive" && actionKind === undefined;
}

function sanitizeSession(value: unknown): SanitizedSession | undefined {
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
    typeof value.isStale !== "boolean" ||
    !isAttention(value.attention) ||
    !hasValidPresentationState(value.status, value.attention, value.actionKind)
  ) {
    return undefined;
  }

  const lastEventAt = Number(value.lastEventAt);
  const lastEventAgeMs = Number(value.lastEventAgeMs);
  const durationMs =
    value.durationMs !== undefined ? Number(value.durationMs) : 0;
  const taskTitle = safeString(value.taskTitle, 120);
  const activityLabel = safeString(value.activityLabel, 120);
  const staleReason = safeString(value.staleReason, 180);
  const actionKind = isActionKind(value.actionKind)
    ? value.actionKind
    : undefined;

  return {
    sessionKey,
    source,
    surface,
    status: value.status,
    lastEventAt,
    lastEventAgeMs,
    durationMs,
    isStale: value.isStale,
    displayName,
    displayWorkspace,
    attention: value.attention,
    ...(taskTitle ? { taskTitle } : {}),
    ...(activityLabel ? { activityLabel } : {}),
    ...(staleReason ? { staleReason } : {}),
    ...(actionKind ? { actionKind } : {}),
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

  const sessions = value.sessions.map(sanitizeSession);
  if (sessions.some((session) => session === undefined)) {
    return undefined;
  }

  const notifier = safeString(value.notifier, 24);
  return {
    health: { status: "ok" },
    ...(notifier ? { notifier } : {}),
    sessions: sessions as SanitizedSession[],
  };
}
