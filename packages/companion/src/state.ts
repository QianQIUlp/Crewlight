import type { DashboardPollResult } from "./client.js";
import type {
  CompanionActionKind,
  CompanionStatus,
  SanitizedSession,
} from "./sanitize.js";

export type CompanionGlobalState =
  | "offline"
  | "api-unavailable"
  | "needs-you"
  | "failed"
  | "stale"
  | "running"
  | "completed"
  | "quiet";

export type CompanionSessionTone =
  | "action"
  | "error"
  | "stale"
  | "active"
  | "done"
  | "idle"
  | "unknown";

export type CompanionSessionFilter =
  | "all"
  | "attention"
  | "running"
  | "done"
  | "failed-stale";

export interface CompanionCounts {
  running: number;
  action: number;
  failed: number;
}

export interface CompanionSessionView {
  id: string;
  source: string;
  surface: string;
  title: string;
  workspace: string;
  status: CompanionStatus;
  statusLabel: string;
  activity: string;
  lastEventLabel: string;
  needsAction: boolean;
  isStale: boolean;
  tone: CompanionSessionTone;
  elapsedMs: number;
  stuckWarning: boolean;
  diagnosticHint?: string;
  actionKind?: CompanionActionKind;
  remoteAlias?: string;
}

export interface CompanionViewModel {
  state: CompanionGlobalState;
  summary: string;
  counts: CompanionCounts;
  sessions: CompanionSessionView[];
  updatedAt: number;
  expanded: boolean;
  alwaysOnTop: boolean;
  diagnostic?: string;
  mostImportant?: CompanionSessionView;
}

export interface CompanionWindowState {
  expanded: boolean;
  alwaysOnTop: boolean;
}

const DEFAULT_WINDOW_STATE: CompanionWindowState = {
  expanded: false,
  alwaysOnTop: true,
};

const STATUS_LABELS: Record<CompanionStatus, string> = {
  idle: "Idle",
  running: "Running",
  using_tool: "Using tool",
  waiting_input: "Waiting for input",
  waiting_permission: "Permission needed",
  completed: "Turn finished",
  failed: "Failed",
  rate_limited: "Rate limited",
  unknown: "Unknown",
};

const SURFACE_LABELS: Record<string, string> = {
  unknown: "Unknown",
  cli: "CLI",
  "ide-extension": "IDE extension",
  desktop: "Desktop",
  cloud: "Cloud",
  manual: "Manual",
};

export function getCompanionSurfaceLabel(surface: string): string {
  return SURFACE_LABELS[surface] ?? surface;
}

function isRunning(session: SanitizedSession): boolean {
  return session.status === "running" || session.status === "using_tool";
}

function needsAction(session: SanitizedSession): boolean {
  return (
    session.status === "waiting_permission" ||
    session.status === "waiting_input"
  );
}

function isFailed(session: SanitizedSession): boolean {
  return session.status === "failed" || session.status === "rate_limited";
}

function isStaleRunning(session: SanitizedSession): boolean {
  return session.priority === "stale";
}

function isRecentlyCompleted(session: SanitizedSession): boolean {
  return session.status === "completed" && session.priority === "ready";
}

export function getSessionPriority(session: SanitizedSession): number {
  const ranks = {
    needs_action: 0,
    error: 1,
    stale: 2,
    active: 3,
    ready: 4,
    hidden: 5,
  } as const;
  return ranks[session.priority];
}

export function sortSessions(
  sessions: readonly SanitizedSession[],
): SanitizedSession[] {
  return [...sessions].sort((left, right) => {
    const priorityDifference =
      getSessionPriority(left) - getSessionPriority(right);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }
    const eventDifference = right.lastEventAt - left.lastEventAt;
    return (
      eventDifference || compareSessionKeys(left.sessionKey, right.sessionKey)
    );
  });
}

function compareSessionKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function filterSessionViews(
  sessions: readonly CompanionSessionView[],
  filter: CompanionSessionFilter,
): CompanionSessionView[] {
  if (filter === "all") {
    return [...sessions];
  }

  return sessions.filter((session) => {
    if (filter === "attention") return session.needsAction;
    if (filter === "running") {
      return (
        !session.isStale &&
        (session.status === "running" || session.status === "using_tool")
      );
    }
    if (filter === "done") return session.status === "completed";
    return session.tone === "error" || session.tone === "stale";
  });
}

function formatAge(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function getTone(session: SanitizedSession): CompanionSessionTone {
  switch (session.priority) {
    case "needs_action":
      return "action";
    case "error":
      return "error";
    case "stale":
      return "stale";
    case "active":
      return "active";
    case "ready":
      return "done";
    case "hidden":
      return session.status === "unknown" ? "unknown" : "idle";
  }
}

function getDiagnosticHint(session: SanitizedSession): string | undefined {
  if (session.status === "waiting_permission") return "Permission required";
  if (session.status === "waiting_input") return "User input requested";
  if (session.status === "rate_limited") return "Rate limit reported";
  if (session.status === "failed") return "Agent reported a failure";
  if (isStaleRunning(session)) {
    return "No recent event; session may be stale";
  }
  return undefined;
}

function toSessionView(session: SanitizedSession): CompanionSessionView {
  const diagnosticHint = getDiagnosticHint(session);
  return {
    id: session.viewId,
    source: session.displayName,
    surface: getCompanionSurfaceLabel(session.surface),
    title: session.taskTitle ?? session.displayWorkspace,
    workspace: session.displayWorkspace,
    status: session.status,
    statusLabel: STATUS_LABELS[session.status],
    activity: session.activityLabel ?? STATUS_LABELS[session.status],
    lastEventLabel: formatAge(session.lastEventAgeMs),
    needsAction: needsAction(session),
    isStale: session.priority === "stale",
    tone: getTone(session),
    elapsedMs: session.durationMs,
    stuckWarning: isRunning(session) && session.lastEventAgeMs >= 5 * 60 * 1000,
    ...(diagnosticHint ? { diagnosticHint } : {}),
    ...(session.actionKind ? { actionKind: session.actionKind } : {}),
    ...(session.remoteAlias ? { remoteAlias: session.remoteAlias } : {}),
  };
}

function emptyViewModel(
  state: "offline" | "api-unavailable",
  summary: string,
  diagnostic: string,
  now: number,
  windowState: CompanionWindowState,
): CompanionViewModel {
  return {
    state,
    summary,
    diagnostic,
    counts: { running: 0, action: 0, failed: 0 },
    sessions: [],
    updatedAt: now,
    ...windowState,
  };
}

export function deriveCompanionViewModel(
  result: DashboardPollResult,
  now: number = Date.now(),
  windowState: CompanionWindowState = DEFAULT_WINDOW_STATE,
): CompanionViewModel {
  if (result.kind === "offline") {
    return emptyViewModel(
      "offline",
      "Daemon offline",
      result.diagnostic,
      now,
      windowState,
    );
  }
  if (result.kind === "api-unavailable") {
    return emptyViewModel(
      "api-unavailable",
      "Companion API unavailable",
      result.diagnostic,
      now,
      windowState,
    );
  }

  const sorted = sortSessions(
    result.data.sessions.filter((session) => session.priority !== "hidden"),
  );
  const sessionViews = sorted.map(toSessionView);
  const counts = {
    running: sorted.filter(isRunning).length,
    action: sorted.filter(needsAction).length,
    failed: sorted.filter(isFailed).length,
  };
  const action = sorted.find(needsAction);
  const failure = sorted.find(isFailed);
  const stale = sorted.find(isStaleRunning);
  const recentCompletion = sorted.find(isRecentlyCompleted);

  let state: CompanionGlobalState = "quiet";
  let summary = "All quiet";
  let diagnostic: string | undefined;

  if (action) {
    state = "needs-you";
    summary = "Needs you";
    diagnostic =
      action.status === "waiting_permission"
        ? `${action.displayName} needs permission`
        : `${action.displayName} is waiting for input`;
  } else if (failure) {
    state = "failed";
    summary =
      failure.status === "rate_limited"
        ? `${failure.displayName} rate limited`
        : `${failure.displayName} failed`;
    diagnostic = getDiagnosticHint(failure);
  } else if (stale) {
    state = "stale";
    summary = "Possibly stale";
    diagnostic = `${stale.displayName} has no recent events`;
  } else if (counts.running > 0) {
    state = "running";
    summary = `${counts.running} running`;
  } else if (recentCompletion) {
    state = "completed";
    summary = "Ready for review";
  }

  const mostImportant = sessionViews[0];
  return {
    state,
    summary,
    counts,
    sessions: sessionViews,
    updatedAt: now,
    ...windowState,
    ...(diagnostic ? { diagnostic } : {}),
    ...(mostImportant ? { mostImportant } : {}),
  };
}
