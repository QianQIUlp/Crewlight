import type { DashboardPollResult } from "./client.js";
import type {
  CompanionActionKind,
  CompanionStatus,
  SanitizedSession,
} from "./sanitize.js";

export const RECENT_COMPLETION_MS = 5 * 60 * 1000;

export type CompanionLocale = "en" | "zh-CN";

export interface CompanionDerivationOptions {
  includeSyntheticDemoSessions?: boolean;
  locale?: CompanionLocale;
}

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
  locale: CompanionLocale;
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

const STATUS_LABELS: Record<
  CompanionLocale,
  Record<CompanionStatus, string>
> = {
  en: {
    idle: "Idle",
    running: "Running",
    using_tool: "Using tool",
    waiting_input: "Waiting for input",
    waiting_permission: "Permission needed",
    completed: "Completed",
    failed: "Failed",
    rate_limited: "Rate limited",
    unknown: "Unknown",
  },
  "zh-CN": {
    idle: "空闲",
    running: "运行中",
    using_tool: "正在使用工具",
    waiting_input: "等待输入",
    waiting_permission: "需要授权",
    completed: "已完成",
    failed: "失败",
    rate_limited: "受到限流",
    unknown: "状态未知",
  },
};

const CHINESE_ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  "Session started": "会话已开始",
  "Request submitted": "请求已提交",
  "Using tool": "正在使用工具",
  "Tool completed": "工具已完成",
  "Permission requested": "需要授权",
  "Attention requested": "需要处理",
  "Session completed": "会话已完成",
  "Session failed": "会话失败",
  "Turn completed": "本轮已完成",
  "Session updated": "会话已更新",
  "Status updated": "状态已更新",
  "Permission answered": "已完成授权",
  "Activity updated": "状态已更新",
  "Command running": "命令运行中",
  "Command completed": "命令已完成",
  "Command failed": "命令失败",
  Idle: "空闲",
  Running: "运行中",
  "Input requested": "等待输入",
  "Rate limited": "受到限流",
  "Status unknown": "状态未知",
};

export function localizeSessionActivity(
  session: SanitizedSession,
  locale: CompanionLocale,
): string {
  const activity = session.activityLabel;
  if (!activity) {
    return STATUS_LABELS[locale][session.status];
  }
  return locale === "zh-CN"
    ? (CHINESE_ACTIVITY_LABELS[activity] ?? activity)
    : activity;
}

export function localizeSessionSource(
  session: SanitizedSession,
  locale: CompanionLocale,
): string {
  const isGenericName =
    (session.source === "generic-cli" &&
      session.displayName === "Generic CLI") ||
    (session.source === "custom" && session.displayName === "Custom");
  if (!isGenericName) {
    return session.displayName;
  }
  return locale === "zh-CN" ? "其他工具" : "Other tool";
}

export interface CompanionCopy {
  activity: string;
  allFilter: string;
  collapse: string;
  currentActivity: string;
  detailFor: (expanded: boolean, title: string) => string;
  diagnostic: string;
  disableAlwaysOnTop: string;
  doneFilter: string;
  emptyDetail: string;
  emptyTitle: string;
  expand: string;
  failedCount: string;
  failedStaleFilter: string;
  filterSessions: string;
  hide: string;
  hideDetails: string;
  keepAlwaysOnTop: string;
  crewlightService: string;
  localOnly: string;
  needsActionCount: string;
  needsAttentionFilter: string;
  needsYou: string;
  noCurrentSessions: string;
  noMatchingDetail: string;
  noMatchingTitle: string;
  openCrewlight: string;
  overallState: string;
  pinWindow: string;
  possiblyStuck: string;
  productMode: string;
  quit: string;
  runningCount: string;
  runningFilter: string;
  sessionCounts: string;
  sessionRadar: string;
  sessions: (count: number) => string;
  showDetails: string;
  stale: string;
  startCrewlight: string;
  status: string;
  unpinWindow: string;
  workspace: string;
}

const COMPANION_COPY: Record<CompanionLocale, CompanionCopy> = {
  en: {
    activity: "Activity",
    allFilter: "All",
    collapse: "Collapse",
    currentActivity: "Current activity",
    detailFor: (expanded, title) =>
      `${expanded ? "Hide" : "Show"} details for ${title}`,
    diagnostic: "Note",
    disableAlwaysOnTop: "Disable always on top",
    doneFilter: "Done",
    emptyDetail:
      "Tasks will appear here as supported coding agents report local activity.",
    emptyTitle: "Watching for agents",
    expand: "Expand",
    failedCount: "Issues",
    failedStaleFilter: "Issues",
    filterSessions: "Filter tasks",
    hide: "Hide",
    hideDetails: "Hide details",
    keepAlwaysOnTop: "Keep always on top",
    crewlightService: "Crewlight",
    localOnly: "This computer · updates automatically",
    needsActionCount: "Needs you",
    needsAttentionFilter: "Needs attention",
    needsYou: "Needs you",
    noCurrentSessions: "No active tasks",
    noMatchingDetail:
      "Current activity does not match this filter. Choose All to see every task.",
    noMatchingTitle: "No matching tasks",
    openCrewlight: "Open Crewlight",
    overallState: "Overall status",
    pinWindow: "Pin window",
    possiblyStuck: "⚠️ Possibly stuck (no updates for 5m)",
    productMode: "Live status",
    quit: "Quit",
    runningCount: "Active",
    runningFilter: "Running",
    sessionCounts: "Task counts",
    sessionRadar: "Live tasks",
    sessions: (count) => `${count} ${count === 1 ? "task" : "tasks"}`,
    showDetails: "Show details",
    stale: "Possibly stuck",
    startCrewlight: "Start Crewlight to reconnect.",
    status: "Status",
    unpinWindow: "Unpin window",
    workspace: "Workspace",
  },
  "zh-CN": {
    activity: "活动",
    allFilter: "全部",
    collapse: "收起",
    currentActivity: "当前活动",
    detailFor: (expanded, title) =>
      `${expanded ? "隐藏" : "显示"}${title}的详情`,
    diagnostic: "提示",
    disableAlwaysOnTop: "取消窗口置顶",
    doneFilter: "已完成",
    emptyDetail: "受支持的编程代理报告本地活动后，任务会显示在这里。",
    emptyTitle: "正在等待代理",
    expand: "展开",
    failedCount: "异常",
    failedStaleFilter: "异常",
    filterSessions: "筛选任务",
    hide: "隐藏",
    hideDetails: "隐藏详情",
    keepAlwaysOnTop: "保持窗口置顶",
    crewlightService: "Crewlight",
    localOnly: "仅限本机 · 自动更新",
    needsActionCount: "需要你",
    needsAttentionFilter: "需要处理",
    needsYou: "需要你处理",
    noCurrentSessions: "当前没有任务",
    noMatchingDetail: "当前活动不符合此筛选条件。选择“全部”可查看所有任务。",
    noMatchingTitle: "没有符合条件的任务",
    openCrewlight: "打开 Crewlight",
    overallState: "整体状态",
    pinWindow: "固定窗口",
    possiblyStuck: "⚠️ 可能已停滞（5 分钟内没有更新）",
    productMode: "实时状态",
    quit: "退出",
    runningCount: "进行中",
    runningFilter: "运行中",
    sessionCounts: "任务计数",
    sessionRadar: "实时任务",
    sessions: (count) => `${count} 个任务`,
    showDetails: "显示详情",
    stale: "可能停滞",
    startCrewlight: "启动 Crewlight 后会自动重新连接。",
    status: "状态",
    unpinWindow: "取消固定窗口",
    workspace: "工作区",
  },
};

export function getCompanionCopy(locale: CompanionLocale): CompanionCopy {
  return COMPANION_COPY[locale];
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

export function isSyntheticDemoSession(session: SanitizedSession): boolean {
  const hasDemoPrefix = (value: string | undefined): boolean =>
    /^\s*\[demo\](?:\s|$)/iu.test(value ?? "");

  return (
    session.displayWorkspace.trim().toLocaleLowerCase("en-US") ===
      "crewlight demo" &&
    (hasDemoPrefix(session.taskTitle) || hasDemoPrefix(session.activityLabel))
  );
}

export function formatCompanionAge(
  milliseconds: number,
  locale: CompanionLocale = "en",
): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 5) return locale === "zh-CN" ? "刚刚" : "just now";
  if (seconds < 60) {
    return locale === "zh-CN" ? `${seconds} 秒前` : `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return locale === "zh-CN" ? `${minutes} 分钟前` : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return locale === "zh-CN" ? `${hours} 小时前` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return locale === "zh-CN" ? `${days} 天前` : `${days}d ago`;
}

export function formatCompanionDuration(
  milliseconds: number,
  locale: CompanionLocale = "en",
): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return locale === "zh-CN" ? `${seconds}秒` : `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return locale === "zh-CN"
    ? `${minutes}分 ${remainingSeconds}秒`
    : `${minutes}m ${remainingSeconds}s`;
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

function getDiagnosticHint(
  session: SanitizedSession,
  locale: CompanionLocale,
): string | undefined {
  if (session.status === "waiting_permission") {
    return locale === "zh-CN" ? "需要你的授权" : "Permission required";
  }
  if (session.status === "waiting_input") {
    return locale === "zh-CN" ? "代理正在等待你的输入" : "User input requested";
  }
  if (session.status === "rate_limited") {
    return locale === "zh-CN" ? "代理报告了限流" : "Rate limit reported";
  }
  if (session.status === "failed") {
    return locale === "zh-CN" ? "代理报告了失败" : "Agent reported a failure";
  }
  if (isStaleRunning(session)) {
    return locale === "zh-CN"
      ? `最近一次更新在 ${formatCompanionAge(session.lastEventAgeMs, locale)}，任务可能已停滞`
      : `Last update ${formatCompanionAge(session.lastEventAgeMs, locale)}; this task may be stuck`;
  }
  return undefined;
}

function toSessionView(
  session: SanitizedSession,
  locale: CompanionLocale,
): CompanionSessionView {
  const diagnosticHint = getDiagnosticHint(session, locale);
  return {
    id: session.viewId,
    source: localizeSessionSource(session, locale),
    title: session.taskTitle ?? session.displayWorkspace,
    workspace: session.displayWorkspace,
    status: session.status,
    statusLabel: STATUS_LABELS[locale][session.status],
    activity: localizeSessionActivity(session, locale),
    lastEventLabel: formatCompanionAge(session.lastEventAgeMs, locale),
    needsAction: needsAction(session),
    isStale: isStaleRunning(session),
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
  locale: CompanionLocale,
): CompanionViewModel {
  return {
    locale,
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
  options: CompanionDerivationOptions = {},
): CompanionViewModel {
  const locale = options.locale ?? "en";
  if (result.kind === "offline") {
    return emptyViewModel(
      "offline",
      locale === "zh-CN" ? "服务暂不可用" : "Service unavailable",
      getCompanionCopy(locale).startCrewlight,
      now,
      windowState,
      locale,
    );
  }
  if (result.kind === "api-unavailable") {
    return emptyViewModel(
      "api-unavailable",
      locale === "zh-CN" ? "服务暂不可用" : "Service unavailable",
      getCompanionCopy(locale).startCrewlight,
      now,
      windowState,
      locale,
    );
  }

  const visibleSessions = options.includeSyntheticDemoSessions
    ? result.data.sessions
    : result.data.sessions.filter(
        (session) => !isSyntheticDemoSession(session),
      );
  const sorted = sortSessions(visibleSessions);
  const sessionViews = sorted.map((session) => toSessionView(session, locale));
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
  let summary = locale === "zh-CN" ? "暂无动态" : "All quiet";
  let diagnostic: string | undefined;

  if (action) {
    state = "needs-you";
    summary = locale === "zh-CN" ? "需要你处理" : "Needs you";
    diagnostic =
      action.status === "waiting_permission"
        ? locale === "zh-CN"
          ? `${action.displayName} 需要授权`
          : `${action.displayName} needs permission`
        : locale === "zh-CN"
          ? `${action.displayName} 正在等待输入`
          : `${action.displayName} is waiting for input`;
  } else if (failure) {
    state = "failed";
    summary =
      failure.status === "rate_limited"
        ? locale === "zh-CN"
          ? `${failure.displayName} 受到限流`
          : `${failure.displayName} rate limited`
        : locale === "zh-CN"
          ? `${failure.displayName} 失败`
          : `${failure.displayName} failed`;
    diagnostic = getDiagnosticHint(failure, locale);
  } else if (stale) {
    state = "stale";
    summary = locale === "zh-CN" ? "可能已停滞" : "Possibly stuck";
    diagnostic =
      locale === "zh-CN"
        ? `${stale.displayName} 最近一次更新在 ${formatCompanionAge(stale.lastEventAgeMs, locale)}，可能已停滞`
        : `${stale.displayName} last updated ${formatCompanionAge(stale.lastEventAgeMs, locale)} and may be stuck`;
  } else if (counts.running > 0) {
    state = "running";
    summary =
      locale === "zh-CN"
        ? `${counts.running} 个运行中`
        : `${counts.running} running`;
  } else if (recentCompletion) {
    state = "completed";
    summary = locale === "zh-CN" ? "最近已完成" : "Recently completed";
  }

  const mostImportant = sessionViews[0];
  return {
    locale,
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
