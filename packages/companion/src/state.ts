import type { DashboardPollResult } from "./client.js";
import type {
  CompanionActionKind,
  CompanionStatus,
  SanitizedSession,
} from "./sanitize.js";

export const RECENT_COMPLETION_MS = 5 * 60 * 1000;

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
  diagnosticHint?: string;
  actionKind?: CompanionActionKind;
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
  completed: "Completed",
  failed: "Failed",
  rate_limited: "Rate limited",
  unknown: "Unknown",
};

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
  return session.isStale && isRunning(session);
}

function isRecentlyCompleted(session: SanitizedSession): boolean {
  return (
    session.status === "completed" &&
    session.lastEventAgeMs <= RECENT_COMPLETION_MS
  );
}

export function getSessionPriority(session: SanitizedSession): number {
  if (session.status === "waiting_permission") return 0;
  if (session.status === "waiting_input") return 1;
  if (isFailed(session)) return 2;
  if (isStaleRunning(session)) return 3;
  if (isRunning(session)) return 4;
  if (isRecentlyCompleted(session)) return 5;
  if (session.status === "idle" || session.status === "completed") return 6;
  return 7;
}

export function sortSessions(
  sessions: readonly SanitizedSession[],
): SanitizedSession[] {
  return [...sessions].sort((left, right) => {
    const priorityDifference =
      getSessionPriority(left) - getSessionPriority(right);
    return priorityDifference || right.lastEventAt - left.lastEventAt;
  });
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
  if (needsAction(session)) return "action";
  if (isFailed(session)) return "error";
  if (isStaleRunning(session)) return "stale";
  if (isRunning(session)) return "active";
  if (isRecentlyCompleted(session)) return "done";
  if (session.status === "unknown") return "unknown";
  return "idle";
}

function getDiagnosticHint(session: SanitizedSession): string | undefined {
  if (session.status === "waiting_permission") return "Permission required";
  if (session.status === "waiting_input") return "User input requested";
  if (session.status === "rate_limited") return "Rate limit reported";
  if (session.status === "failed") return "Agent reported a failure";
  if (isStaleRunning(session)) {
    return session.staleReason ?? "No recent event; session may be stale";
  }
  return undefined;
}

function toSessionView(session: SanitizedSession): CompanionSessionView {
  const diagnosticHint = getDiagnosticHint(session);
  return {
    source: session.displayName,
    surface: session.surface,
    title: session.taskTitle ?? session.displayWorkspace,
    workspace: session.displayWorkspace,
    status: session.status,
    statusLabel: STATUS_LABELS[session.status],
    activity: session.activityLabel ?? STATUS_LABELS[session.status],
    lastEventLabel: formatAge(session.lastEventAgeMs),
    needsAction: needsAction(session),
    isStale: isStaleRunning(session),
    tone: getTone(session),
    ...(diagnosticHint ? { diagnosticHint } : {}),
    ...(session.actionKind ? { actionKind: session.actionKind } : {}),
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

  const sorted = sortSessions(result.data.sessions);
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
    diagnostic =
      stale.staleReason ?? `${stale.displayName} has no recent events`;
  } else if (counts.running > 0) {
    state = "running";
    summary = `${counts.running} running`;
  } else if (recentCompletion) {
    state = "completed";
    summary = "Recently completed";
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
