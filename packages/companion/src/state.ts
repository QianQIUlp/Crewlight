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

const SURFACE_LABELS: Record<CompanionLocale, Record<string, string>> = {
  en: {
    unknown: "Unknown",
    cli: "CLI",
    "ide-extension": "IDE extension",
    desktop: "Desktop",
    cloud: "Cloud",
    manual: "Manual",
  },
  "zh-CN": {
    unknown: "未知",
    cli: "CLI",
    "ide-extension": "IDE 扩展",
    desktop: "桌面端",
    cloud: "云端",
    manual: "手动",
  },
};

export interface CompanionCopy {
  activity: string;
  allFilter: string;
  collapse: string;
  copied: string;
  copyDaemonCommand: string;
  copyFailed: string;
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
  localConnection: string;
  localOnly: string;
  needsActionCount: string;
  needsAttentionFilter: string;
  needsYou: string;
  noCurrentSessions: string;
  noMatchingDetail: string;
  noMatchingTitle: string;
  openDashboard: string;
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
  startDaemon: string;
  status: string;
  unpinWindow: string;
  workspace: string;
}

const COMPANION_COPY: Record<CompanionLocale, CompanionCopy> = {
  en: {
    activity: "Activity",
    allFilter: "All",
    collapse: "Collapse",
    copied: "Copied",
    copyDaemonCommand: "Copy daemon command",
    copyFailed: "Copy failed",
    currentActivity: "Current activity",
    detailFor: (expanded, title) =>
      `${expanded ? "Hide" : "Show"} details for ${title}`,
    diagnostic: "Diagnostic",
    disableAlwaysOnTop: "Disable always on top",
    doneFilter: "Done",
    emptyDetail:
      "Sessions will appear here as supported coding agents report local activity.",
    emptyTitle: "Watching for agents",
    expand: "Expand",
    failedCount: "Failed",
    failedStaleFilter: "Failed / stale",
    filterSessions: "Filter sessions",
    hide: "Hide",
    hideDetails: "Hide details",
    keepAlwaysOnTop: "Keep always on top",
    localConnection: "Local connection",
    localOnly: "Local only · refreshes every 2s",
    needsActionCount: "Needs action",
    needsAttentionFilter: "Needs attention",
    needsYou: "Needs you",
    noCurrentSessions: "No current sessions",
    noMatchingDetail:
      "Current activity does not match this filter. Choose All to see every observed session.",
    noMatchingTitle: "No matching sessions",
    openDashboard: "Open Dashboard",
    overallState: "Overall state",
    pinWindow: "Pin window",
    possiblyStuck: "⚠️ Possibly stuck (no events for 5m)",
    productMode: "Local companion",
    quit: "Quit",
    runningCount: "Running",
    runningFilter: "Running",
    sessionCounts: "Session counts",
    sessionRadar: "Session radar",
    sessions: (count) => `${count} ${count === 1 ? "session" : "sessions"}`,
    showDetails: "Show details",
    stale: "Stale",
    startDaemon:
      "Start the dashboard-enabled daemon. Crewlight will reconnect automatically.",
    status: "Status",
    unpinWindow: "Unpin window",
    workspace: "Workspace",
  },
  "zh-CN": {
    activity: "活动",
    allFilter: "全部",
    collapse: "收起",
    copied: "已复制",
    copyDaemonCommand: "复制服务启动命令",
    copyFailed: "复制失败",
    currentActivity: "当前活动",
    detailFor: (expanded, title) =>
      `${expanded ? "隐藏" : "显示"}${title}的详情`,
    diagnostic: "诊断",
    disableAlwaysOnTop: "取消窗口置顶",
    doneFilter: "已完成",
    emptyDetail: "受支持的编程代理报告本地活动后，会话会显示在这里。",
    emptyTitle: "正在等待代理",
    expand: "展开",
    failedCount: "失败",
    failedStaleFilter: "失败 / 可能停滞",
    filterSessions: "筛选会话",
    hide: "隐藏",
    hideDetails: "隐藏详情",
    keepAlwaysOnTop: "保持窗口置顶",
    localConnection: "本地连接",
    localOnly: "仅限本机 · 每 2 秒刷新",
    needsActionCount: "需要处理",
    needsAttentionFilter: "需要处理",
    needsYou: "需要你处理",
    noCurrentSessions: "当前没有会话",
    noMatchingDetail: "当前活动不符合此筛选条件。选择“全部”可查看所有会话。",
    noMatchingTitle: "没有符合条件的会话",
    openDashboard: "打开仪表盘",
    overallState: "整体状态",
    pinWindow: "固定窗口",
    possiblyStuck: "⚠️ 可能已停滞（5 分钟内没有事件）",
    productMode: "本地伴侣",
    quit: "退出",
    runningCount: "运行中",
    runningFilter: "运行中",
    sessionCounts: "会话计数",
    sessionRadar: "会话雷达",
    sessions: (count) => `${count} 个会话`,
    showDetails: "显示详情",
    stale: "可能停滞",
    startDaemon: "请启动带仪表盘的本地服务，Crewlight 会自动重新连接。",
    status: "状态",
    unpinWindow: "取消固定窗口",
    workspace: "工作区",
  },
};

export function getCompanionCopy(locale: CompanionLocale): CompanionCopy {
  return COMPANION_COPY[locale];
}

export function getCompanionSurfaceLabel(
  surface: string,
  locale: CompanionLocale = "en",
): string {
  return SURFACE_LABELS[locale][surface] ?? surface;
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
      ? `最近一次事件在 ${formatCompanionAge(session.lastEventAgeMs, locale)}，会话可能已停滞`
      : (session.staleReason ?? "No recent event; session may be stale");
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
    source: session.displayName,
    surface: getCompanionSurfaceLabel(session.surface, locale),
    title: session.taskTitle ?? session.displayWorkspace,
    workspace: session.displayWorkspace,
    status: session.status,
    statusLabel: STATUS_LABELS[locale][session.status],
    activity: session.activityLabel ?? STATUS_LABELS[locale][session.status],
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
      locale === "zh-CN" ? "本地服务离线" : "Daemon offline",
      locale === "zh-CN"
        ? "无法连接本地服务。请在桌面应用中启动服务，Crewlight 会自动重新连接。"
        : result.diagnostic,
      now,
      windowState,
      locale,
    );
  }
  if (result.kind === "api-unavailable") {
    return emptyViewModel(
      "api-unavailable",
      locale === "zh-CN" ? "伴侣接口不可用" : "Companion API unavailable",
      locale === "zh-CN"
        ? "本地服务没有提供伴侣接口。请从桌面应用中重启服务。"
        : result.diagnostic,
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
    summary = locale === "zh-CN" ? "可能已停滞" : "Possibly stale";
    diagnostic =
      locale === "zh-CN"
        ? `${stale.displayName} 最近一次事件在 ${formatCompanionAge(stale.lastEventAgeMs, locale)}，可能已停滞`
        : (stale.staleReason ?? `${stale.displayName} has no recent events`);
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
