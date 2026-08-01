import type { DoctorCheck, DoctorReport } from "@crewlight/cli";
import type { NotifierKind } from "@crewlight/notifier";

import type { DesktopDashboardResult } from "./desktop-client.js";
import type {
  DesktopAccent,
  DesktopDensity,
  DesktopLocale,
  DesktopPreferences,
  DesktopSection,
  DesktopTheme,
  PreferredIntegration,
} from "./desktop-preferences.js";
import type { ManagedServiceState } from "./service-manager.js";
import {
  deriveCompanionViewModel,
  getCompanionSurfaceLabel,
  isSyntheticDemoSession,
  sortSessions,
} from "./state.js";
import type { SanitizedSession } from "./sanitize.js";

const STATUS_LABELS: Record<
  DesktopLocale,
  Record<SanitizedSession["status"], string>
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

const SECTION_LABELS: Record<DesktopLocale, Record<DesktopSection, string>> = {
  en: {
    home: "Home",
    remote: "Remote",
    doctor: "Doctor",
    agents: "Agents",
    companion: "Companion",
    demo: "Demo",
    appearance: "Appearance",
    settings: "Settings",
    about: "About",
  },
  "zh-CN": {
    home: "首页",
    remote: "远程",
    doctor: "诊断",
    agents: "代理接入",
    companion: "悬浮伴侣",
    demo: "演示",
    appearance: "外观",
    settings: "设置",
    about: "关于",
  },
};

function pick(locale: DesktopLocale, english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

export type DesktopNoticeTone = "info" | "success" | "error";

export interface DesktopNotice {
  message: string;
  tone: DesktopNoticeTone;
}

export interface DesktopRuntimeSettings {
  host: string;
  port: number;
  notifier: NotifierKind;
}

export interface DesktopCompanionState {
  alwaysOnTop: boolean;
  expanded: boolean;
  topSession?: string;
  updatedAt?: number;
  visible: boolean;
}

export interface DesktopSetupSnippets {
  antigravityProbe: string;
  claudeCode: string;
  codex: string;
  codexHooks: string;
  cursor: string;
  openCode: string;
  verification: {
    antigravityProbe: string;
    claudeCode: string;
    codex: string;
    cursor: string;
  };
}

export interface DesktopStatusBadge {
  label: string;
  tone: "active" | "warning" | "error" | "neutral" | "success";
}

export interface DesktopSessionCard {
  id: string;
  activity: string;
  ageLabel: string;
  demoLabel?: string;
  diagnosticHint?: string;
  needsAction: boolean;
  source: string;
  statusLabel: string;
  surface: string;
  title: string;
  tone: "active" | "attention" | "error" | "quiet" | "stale";
  workspace: string;
  elapsedMs: number;
  stuckWarning: boolean;
  remoteAlias?: string;
}

export interface DesktopActionCard {
  action: "show-companion" | "start-service";
  description: string;
  label: string;
}

export interface DesktopOnboardingStep {
  complete: boolean;
  description: string;
  id:
    | "welcome"
    | "start-service"
    | "show-companion"
    | "choose-integration"
    | "finish";
  title: string;
}

export interface DesktopIntegrationCard {
  boundary: string;
  configureDisabled?: boolean;
  configureLabel?: string;
  copySetupLabel: string;
  copyVerificationLabel?: string;
  highlight: boolean;
  id: PreferredIntegration;
  maturity: string;
  observed: string;
  observes: string;
  setupCommand: string;
  setupStatus: string;
  title: string;
  verificationCommand?: string;
}

export interface DesktopViewModel {
  about: {
    boundaries: string[];
    license: string;
    migrationSummary: string[];
    repoUrl: string;
    tagline: string;
    version: string;
  };
  appearance: {
    accent: DesktopAccent;
    density: DesktopDensity;
    locale: DesktopLocale;
    theme: DesktopTheme;
  };
  companion: DesktopCompanionState & {
    modeLabel: string;
    statusLabel: string;
  };
  demo: {
    hasSyntheticSessions: boolean;
    sessions: DesktopSessionCard[];
    summary: string;
  };
  doctor: {
    checks: DoctorCheck[];
    platformLabel: string;
    summary: string;
  };
  header: {
    lastUpdatedLabel: string;
    serviceBadge: DesktopStatusBadge;
    summary: string;
  };
  home: {
    counts: {
      attention: number;
      failedOrStale: number;
      running: number;
      total: number;
    };
    primaryAction: DesktopActionCard;
    previewSessions: DesktopSessionCard[];
    tagline: string;
  };
  integrations: DesktopIntegrationCard[];
  notice?: DesktopNotice;
  onboarding: {
    active: boolean;
    currentStepId: DesktopOnboardingStep["id"];
    steps: DesktopOnboardingStep[];
  };
  selectedSection: DesktopSection;
  sections: Array<{
    active: boolean;
    id: DesktopSection;
    label: string;
  }>;
  settings: {
    companionVisibilityPreference: boolean;
    host: string;
    notifier: NotifierKind;
    onboardingCompleted: boolean;
    port: number;
    preferredIntegration?: PreferredIntegration;
    serviceAutoStart: boolean;
  };
  remote: {
    hosts: DesktopRemoteHost[];
  };
}

export interface DesktopRemoteHost {
  alias: string;
  hostname?: string;
  user?: string;
  port?: number;
  tunnelState: "disconnected" | "connecting" | "connected" | "error";
  tunnelMessage?: string;
  hasCli?: boolean;
  autoConnect?: boolean;
  installPromptDismissed?: boolean;
}

export interface DesktopViewModelInput {
  companion: DesktopCompanionState;
  doctorReport: DoctorReport;
  notice?: DesktopNotice;
  preferences: DesktopPreferences;
  runtimeSettings: DesktopRuntimeSettings;
  serviceState: ManagedServiceState;
  snapshot: DesktopDashboardResult;
  version: string;
  remoteHosts: DesktopRemoteHost[];
  integrationInstallations?: Partial<
    Record<
      "claude-code" | "codex",
      "configured" | "not-configured" | "conflict" | "unavailable" | "error"
    >
  >;
}

function formatRelativeAge(
  milliseconds: number,
  locale: DesktopLocale,
): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 5) {
    return pick(locale, "just now", "刚刚");
  }
  if (seconds < 60) {
    return pick(locale, `${seconds}s ago`, `${seconds} 秒前`);
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return pick(locale, `${minutes}m ago`, `${minutes} 分钟前`);
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return pick(locale, `${hours}h ago`, `${hours} 小时前`);
  }

  const days = Math.floor(hours / 24);
  return pick(locale, `${days}d ago`, `${days} 天前`);
}

function formatTimestamp(
  timestamp: number | undefined,
  locale: DesktopLocale,
): string {
  if (timestamp === undefined) {
    return pick(locale, "Waiting for local status", "等待本地状态");
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDesktopDuration(
  milliseconds: number,
  locale: DesktopLocale,
): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return pick(locale, `${seconds}s`, `${seconds} 秒`);
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return pick(
    locale,
    `${minutes}m ${remainingSeconds}s`,
    `${minutes} 分 ${remainingSeconds} 秒`,
  );
}

function platformLabel(): string {
  if (process.platform === "win32") {
    return "Windows";
  }
  if (process.platform === "darwin") {
    return "macOS";
  }
  return "Linux";
}

function isRunning(session: SanitizedSession): boolean {
  return session.status === "running" || session.status === "using_tool";
}

function needsAction(session: SanitizedSession): boolean {
  return (
    session.status === "waiting_input" ||
    session.status === "waiting_permission"
  );
}

function isError(session: SanitizedSession): boolean {
  return session.status === "failed" || session.status === "rate_limited";
}

const DEMO_TEXT: Record<string, { en: string; "zh-CN": string }> = {
  "[Demo] Running Crewlight tests": {
    en: "Running Crewlight tests",
    "zh-CN": "运行 Crewlight 测试",
  },
  "[Demo] Updating README": {
    en: "Updating README",
    "zh-CN": "更新 README",
  },
  "[Demo] Reviewing companion UI": {
    en: "Reviewing companion UI",
    "zh-CN": "检查悬浮伴侣界面",
  },
  "[Demo] Adapter smoke check": {
    en: "Adapter smoke check",
    "zh-CN": "适配器冒烟检查",
  },
  "[Demo] Local setup validation": {
    en: "Local setup validation",
    "zh-CN": "本地配置验证",
  },
  "[Demo] Background dependency scan": {
    en: "Background dependency scan",
    "zh-CN": "后台依赖扫描",
  },
  "[Demo] Running tests": {
    en: "Running tests",
    "zh-CN": "正在运行测试",
  },
  "[Demo] Permission to edit README": {
    en: "Permission to edit README",
    "zh-CN": "请求编辑 README 的权限",
  },
  "[Demo] Companion review requested": {
    en: "Companion review requested",
    "zh-CN": "等待确认悬浮伴侣界面",
  },
  "[Demo] Adapter smoke completed": {
    en: "Adapter smoke completed",
    "zh-CN": "适配器冒烟检查已完成",
  },
  "[Demo] Local setup failed": {
    en: "Local setup failed",
    "zh-CN": "本地配置验证失败",
  },
  "[Demo] Background scan last reported": {
    en: "Background scan last reported",
    "zh-CN": "后台扫描最后一次上报",
  },
  "Crewlight Demo": {
    en: "Crewlight Demo",
    "zh-CN": "Crewlight 演示",
  },
};

const ZH_SURFACE_LABELS: Record<string, string> = {
  unknown: "未知",
  cli: "命令行",
  "ide-extension": "IDE 扩展",
  desktop: "桌面",
  cloud: "云端",
  manual: "手动",
};

function localizeDemoText(value: string, locale: DesktopLocale): string {
  const known = DEMO_TEXT[value];
  if (known) {
    return known[locale];
  }
  if (!value.startsWith("[Demo]")) {
    return value;
  }
  const withoutMarker = value.slice("[Demo]".length).trimStart();
  return locale === "zh-CN" ? `演示：${withoutMarker}` : withoutMarker;
}

function desktopSurfaceLabel(surface: string, locale: DesktopLocale): string {
  if (locale === "zh-CN") {
    return ZH_SURFACE_LABELS[surface] ?? surface;
  }
  return getCompanionSurfaceLabel(surface);
}

function sessionTone(session: SanitizedSession): DesktopSessionCard["tone"] {
  if (needsAction(session)) {
    return "attention";
  }
  if (isError(session)) {
    return "error";
  }
  if (session.isStale && isRunning(session)) {
    return "stale";
  }
  if (isRunning(session)) {
    return "active";
  }
  return "quiet";
}

function diagnosticHint(
  session: SanitizedSession,
  locale: DesktopLocale,
): string | undefined {
  if (session.status === "waiting_permission") {
    return pick(locale, "Permission required", "需要你的授权");
  }
  if (session.status === "waiting_input") {
    return pick(locale, "User input requested", "代理正在等待你的输入");
  }
  if (session.status === "failed") {
    return pick(locale, "Agent reported a failure", "代理报告了失败");
  }
  if (session.status === "rate_limited") {
    return pick(locale, "Rate limit reported", "代理报告了限流");
  }
  if (session.isStale && isRunning(session)) {
    return locale === "zh-CN"
      ? `最近一次事件在 ${formatRelativeAge(session.lastEventAgeMs, locale)}，任务可能已停滞`
      : (session.staleReason ?? "No recent event; session may be stale");
  }
  return undefined;
}

function toSessionCard(
  session: SanitizedSession,
  locale: DesktopLocale,
): DesktopSessionCard {
  const hint = diagnosticHint(session, locale);
  const demo = isSyntheticDemoSession(session);
  const activity =
    session.activityLabel ?? STATUS_LABELS[locale][session.status];
  const title = session.taskTitle ?? session.displayWorkspace;
  return {
    id: session.viewId,
    activity: demo ? localizeDemoText(activity, locale) : activity,
    ageLabel: formatRelativeAge(session.lastEventAgeMs, locale),
    ...(demo ? { demoLabel: pick(locale, "Demo", "演示") } : {}),
    ...(hint ? { diagnosticHint: hint } : {}),
    needsAction: needsAction(session),
    source: session.displayName,
    statusLabel: STATUS_LABELS[locale][session.status],
    surface: desktopSurfaceLabel(session.surface, locale),
    title: demo ? localizeDemoText(title, locale) : title,
    tone: sessionTone(session),
    workspace: demo
      ? localizeDemoText(session.displayWorkspace, locale)
      : session.displayWorkspace,
    elapsedMs: session.durationMs,
    stuckWarning: isRunning(session) && session.lastEventAgeMs >= 5 * 60 * 1000,
    ...(session.remoteAlias ? { remoteAlias: session.remoteAlias } : {}),
  };
}

function currentStepId(
  steps: readonly DesktopOnboardingStep[],
): DesktopOnboardingStep["id"] {
  return steps.find((step) => !step.complete)?.id ?? "finish";
}

function integrationCards(
  sessions: readonly SanitizedSession[],
  preferredIntegration: PreferredIntegration | undefined,
  setup: DesktopSetupSnippets,
  locale: DesktopLocale,
  installations: DesktopViewModelInput["integrationInstallations"] = {},
): DesktopIntegrationCard[] {
  const observedSources = new Set(sessions.map((session) => session.source));
  const setupLabel = (
    status: NonNullable<
      DesktopViewModelInput["integrationInstallations"]
    >["codex"],
  ): string => {
    if (status === "configured") {
      return pick(locale, "Configured", "已配置");
    }
    if (status === "conflict") {
      return pick(locale, "Existing settings need review", "已有配置需要确认");
    }
    if (status === "unavailable") {
      return pick(
        locale,
        "Current app path is not supported",
        "当前应用路径无法安全配置",
      );
    }
    if (status === "error") {
      return pick(locale, "Configuration could not be checked", "无法检查配置");
    }
    return pick(locale, "One-click setup ready", "可以一键配置");
  };
  const configureDisabled = (
    status: NonNullable<
      DesktopViewModelInput["integrationInstallations"]
    >["codex"],
  ): boolean =>
    status === "configured" ||
    status === "conflict" ||
    status === "unavailable" ||
    status === "error";
  const configureLabel = (
    status: NonNullable<
      DesktopViewModelInput["integrationInstallations"]
    >["codex"],
  ): string =>
    status === "configured"
      ? pick(locale, "Configured", "已配置")
      : pick(locale, "Configure", "配置接入");
  const claudeStatus = installations["claude-code"] ?? "not-configured";
  const codexStatus = installations.codex ?? "not-configured";
  return [
    {
      boundary: pick(
        locale,
        "Crewlight adds only its own entries to your user settings and creates a backup first.",
        "Crewlight 只会向用户配置中合并自己的条目，并且会先创建备份。",
      ),
      configureDisabled: configureDisabled(claudeStatus),
      configureLabel: configureLabel(claudeStatus),
      copySetupLabel: pick(locale, "Copy manual setup", "复制手动配置"),
      copyVerificationLabel: pick(locale, "Copy test command", "复制测试命令"),
      highlight: preferredIntegration === "claude-code",
      id: "claude-code",
      maturity: pick(locale, "Recommended", "推荐"),
      observed: observedSources.has("claude-code")
        ? pick(locale, "Receiving activity", "正在接收状态")
        : pick(locale, "Ready", "可以接入"),
      observes: pick(
        locale,
        "Shows when Claude Code is working, waiting for you, finished, or failed.",
        "显示 Claude Code 何时工作、等待你处理、完成或失败。",
      ),
      setupCommand: setup.claudeCode,
      setupStatus: observedSources.has("claude-code")
        ? pick(locale, "Live activity detected", "已检测到实时活动")
        : setupLabel(claudeStatus),
      title: "Claude Code",
      verificationCommand: setup.verification.claudeCode,
    },
    {
      boundary: pick(
        locale,
        "Crewlight observes status only. It never approves permissions or controls Codex for you.",
        "Crewlight 只观察状态，不会替你批准权限，也不会控制 Codex。",
      ),
      configureDisabled: configureDisabled(codexStatus),
      configureLabel: configureLabel(codexStatus),
      copySetupLabel: pick(locale, "Copy manual setup", "复制手动配置"),
      copyVerificationLabel: pick(locale, "Copy test command", "复制测试命令"),
      highlight: preferredIntegration === "codex",
      id: "codex",
      maturity: pick(locale, "Recommended", "推荐"),
      observed: observedSources.has("codex")
        ? pick(locale, "Receiving activity", "正在接收状态")
        : pick(locale, "Ready", "可以接入"),
      observes: pick(
        locale,
        "Shows when Codex is working, using tools, waiting for permission, or finished.",
        "显示 Codex 何时工作、使用工具、等待授权或完成。",
      ),
      setupCommand: setup.codexHooks,
      setupStatus: observedSources.has("codex")
        ? pick(locale, "Live activity detected", "已检测到实时活动")
        : setupLabel(codexStatus),
      title: "Codex",
      verificationCommand: setup.verification.codex,
    },
    {
      boundary:
        "Manual / Experimental bridge. No automatic Cursor lifecycle hook or private API scraping is claimed.",
      copySetupLabel: "Copy setup commands",
      copyVerificationLabel: "Copy verification command",
      highlight: preferredIntegration === "cursor",
      id: "cursor",
      maturity: "Manual / Experimental bridge",
      observed: observedSources.has("cursor")
        ? "Observed in current daemon"
        : "Manual bridge available",
      observes: "Explicit terminal or task-driven status updates only.",
      setupCommand: setup.cursor,
      setupStatus: observedSources.has("cursor")
        ? "Live activity detected"
        : "Manual commands ready",
      title: "Cursor",
      verificationCommand: setup.verification.cursor,
    },
    {
      boundary:
        "Uses documented local plugin events and keeps payload handling allowlisted and local.",
      copySetupLabel: "Copy plugin file",
      highlight: preferredIntegration === "opencode",
      id: "opencode",
      maturity: "Implemented, verification pending",
      observed: observedSources.has("opencode")
        ? "Observed in current daemon"
        : "Plugin scaffold ready",
      observes:
        "Session and permission lifecycle updates from the local OpenCode plugin.",
      setupCommand: setup.openCode,
      setupStatus: observedSources.has("opencode")
        ? "Live activity detected"
        : "Plugin scaffold ready",
      title: "OpenCode",
    },
    {
      boundary:
        "Use manual ingest or local probes only. No private API scraping, hidden permissions, or background control paths.",
      copySetupLabel: "Copy ingest command",
      copyVerificationLabel: "Copy verification command",
      highlight: preferredIntegration === "manual",
      id: "manual",
      maturity: "Manual / Custom ingest",
      observed:
        observedSources.has("custom") || observedSources.has("generic-cli")
          ? "Observed in current daemon"
          : "Manual path available",
      observes:
        "Manual normalized events, generic CLI wrapping, and bounded local probes.",
      setupCommand: setup.antigravityProbe,
      setupStatus:
        observedSources.has("custom") || observedSources.has("generic-cli")
          ? "Live activity detected"
          : "Manual path ready",
      title: "Manual / Custom ingest",
      verificationCommand: setup.verification.antigravityProbe,
    },
  ];
}

function serviceBadge(
  serviceState: ManagedServiceState,
  snapshot: DesktopDashboardResult,
  locale: DesktopLocale,
): DesktopStatusBadge {
  if (serviceState.phase === "starting") {
    return {
      label: pick(locale, "Starting local service", "正在启动本地服务"),
      tone: "active",
    };
  }
  if (serviceState.phase === "stopping") {
    return {
      label: pick(locale, "Stopping local service", "正在停止本地服务"),
      tone: "warning",
    };
  }
  if (serviceState.phase === "running") {
    return {
      label: pick(locale, "Managed local service", "本地服务运行中"),
      tone: "success",
    };
  }
  if (snapshot.kind === "online") {
    return {
      label: pick(
        locale,
        "External local service detected",
        "已检测到外部本地服务",
      ),
      tone: "active",
    };
  }
  if (serviceState.phase === "error") {
    return {
      label: pick(locale, "Local service needs attention", "本地服务需要处理"),
      tone: "error",
    };
  }
  return {
    label: pick(locale, "Local service stopped", "本地服务已停止"),
    tone: "neutral",
  };
}

function primaryAction(
  serviceState: ManagedServiceState,
  snapshot: DesktopDashboardResult,
  companion: DesktopCompanionState,
  locale: DesktopLocale,
): DesktopActionCard {
  if (serviceState.phase !== "running" && snapshot.kind !== "online") {
    return {
      action: "start-service",
      description: pick(
        locale,
        "Start the local daemon and dashboard so Crewlight can watch live sessions.",
        "启动本地服务，让 Crewlight 开始汇总实时代理会话。",
      ),
      label: pick(locale, "Start local service", "启动本地服务"),
    };
  }
  return {
    action: "show-companion",
    description: companion.visible
      ? pick(
          locale,
          "Bring the floating companion forward for a quick status read.",
          "把悬浮伴侣带到前台，快速查看当前状态。",
        )
      : pick(
          locale,
          "Show the floating companion to keep live status visible while you work elsewhere.",
          "显示悬浮伴侣，在其他窗口工作时也能掌握实时状态。",
        ),
    label: companion.visible
      ? pick(locale, "Bring companion forward", "将悬浮伴侣置于前台")
      : pick(locale, "Show companion", "显示悬浮伴侣"),
  };
}

export function buildDiagnosticSummary(
  serviceState: ManagedServiceState,
  runtimeSettings: DesktopRuntimeSettings,
  doctorReport: DoctorReport,
): string {
  return [
    `Crewlight Desktop ${process.platform}`,
    `Service: ${serviceState.phase}`,
    `Managed: ${serviceState.managed ? "yes" : "no"}`,
    `Host: ${runtimeSettings.host}`,
    `Port: ${runtimeSettings.port}`,
    `Notifier: ${runtimeSettings.notifier}`,
    "",
    ...doctorReport.checks.map(
      (check) =>
        `[${check.status}] ${check.id}: ${check.message}${
          check.action ? ` Action: ${check.action}` : ""
        }`,
    ),
  ].join("\n");
}

export function deriveDesktopViewModel(
  input: DesktopViewModelInput,
  setup: DesktopSetupSnippets,
): DesktopViewModel {
  const locale = input.preferences.locale;
  const liveSessions =
    input.snapshot.kind === "online" ? input.snapshot.data.sessions : [];
  const sortedSessions = sortSessions(liveSessions);
  const demoSessions = sortedSessions.filter(isSyntheticDemoSession);
  const realSessions = sortedSessions.filter(
    (session) => !isSyntheticDemoSession(session),
  );
  const companionView = deriveCompanionViewModel(
    input.snapshot.kind === "online"
      ? { kind: "online", data: { sessions: realSessions } }
      : input.snapshot,
    Date.now(),
    undefined,
    { locale },
  );
  const previewSessions = realSessions
    .slice(0, 4)
    .map((session) => toSessionCard(session, locale));
  const failedOrStale = realSessions.filter(
    (session) => isError(session) || (session.isStale && isRunning(session)),
  ).length;
  const sections = Object.entries(SECTION_LABELS[locale]).map(
    ([id, label]) => ({
      active: input.preferences.lastSection === id,
      id: id as DesktopSection,
      label,
    }),
  );
  const onboardingSteps: DesktopOnboardingStep[] = [
    {
      id: "welcome",
      title: pick(locale, "Welcome", "欢迎"),
      description: pick(
        locale,
        "Meet Crewlight Desktop and the local-first workflow.",
        "认识 Crewlight Desktop 和本地优先的工作方式。",
      ),
      complete: true,
    },
    {
      id: "start-service",
      title: pick(locale, "Start local service", "启动本地服务"),
      description: pick(
        locale,
        "Bring up the loopback daemon and dashboard API.",
        "启动仅监听回环地址的守护进程和面板 API。",
      ),
      complete:
        input.serviceState.phase === "running" ||
        input.snapshot.kind === "online",
    },
    {
      id: "choose-integration",
      title: pick(locale, "Choose an integration path", "选择接入方式"),
      description: pick(
        locale,
        "Pick the first setup path you want Crewlight to highlight.",
        "选择希望 Crewlight 优先引导的接入方式。",
      ),
      complete:
        input.preferences.preferredIntegration !== undefined ||
        input.integrationInstallations?.["claude-code"] === "configured" ||
        input.integrationInstallations?.codex === "configured",
    },
    {
      id: "show-companion",
      title: pick(locale, "Show companion", "显示悬浮伴侣"),
      description: pick(
        locale,
        "Open the floating companion so real status stays nearby.",
        "打开悬浮伴侣，让真实状态始终近在眼前。",
      ),
      complete: input.companion.visible,
    },
    {
      id: "finish",
      title: pick(locale, "Finish", "完成"),
      description: pick(
        locale,
        "Land in Home and keep the current local state intact.",
        "进入首页，并保留当前本地状态。",
      ),
      complete: input.preferences.onboardingCompleted,
    },
  ];
  const integrations = integrationCards(
    realSessions,
    input.preferences.preferredIntegration,
    setup,
    locale,
    input.integrationInstallations,
  );

  return {
    about: {
      boundaries:
        locale === "zh-CN"
          ? [
              "不依赖云端服务",
              "不抓取私有 API",
              "不自动批准权限",
              "不保留提示词、对话或工具输入输出",
            ]
          : [
              "No cloud service",
              "No private API scraping",
              "No automatic permission approval",
              "No prompt, transcript, or tool I/O retention",
            ],
      license: "MIT",
      migrationSummary:
        locale === "zh-CN"
          ? [
              "AgentPulse 现已更名为 Crewlight。",
              "桌面应用是 v0.5.0 的主要用户界面。",
              "CLI 和浏览器面板仍可用于高级本地工作流。",
            ]
          : [
              "AgentPulse is now Crewlight.",
              "The desktop app is the primary user-facing v0.5.0 surface.",
              "CLI and browser dashboard remain available for advanced local workflows.",
            ],
      repoUrl: "https://github.com/QianQIUlp/Crewlight",
      tagline: pick(
        locale,
        "Local activity radar for AI coding agents.",
        "面向 AI 编码代理的本地活动雷达。",
      ),
      version: input.version,
    },
    appearance: {
      accent: input.preferences.accent,
      density: input.preferences.density,
      locale,
      theme: input.preferences.theme,
    },
    companion: {
      ...input.companion,
      modeLabel: input.companion.expanded
        ? pick(locale, "Expanded mode", "展开模式")
        : pick(locale, "Compact mode", "紧凑模式"),
      statusLabel: input.companion.visible
        ? pick(locale, "Visible", "已显示")
        : pick(locale, "Hidden", "已隐藏"),
    },
    demo: {
      hasSyntheticSessions: demoSessions.length > 0,
      sessions: demoSessions.map((session) => toSessionCard(session, locale)),
      summary:
        demoSessions.length > 0
          ? pick(
              locale,
              `${demoSessions.length} synthetic local sessions are active. Rerun the demo to refresh the same identities.`,
              `${demoSessions.length} 个合成本地会话正在运行。再次运行演示可刷新同一组会话。`,
            )
          : pick(
              locale,
              "Run the local multi-agent demo to populate the Demo view with synthetic sessions.",
              "运行本地多代理演示，在演示页面中载入合成会话。",
            ),
    },
    doctor: {
      checks: input.doctorReport.checks,
      platformLabel: platformLabel(),
      summary: input.doctorReport.ok
        ? pick(
            locale,
            "Doctor checks look healthy for the current local setup.",
            "当前本地环境的诊断结果正常。",
          )
        : pick(
            locale,
            "Doctor found follow-up items before release or daily use.",
            "诊断发现了需要在发布或日常使用前处理的问题。",
          ),
    },
    header: {
      lastUpdatedLabel:
        input.snapshot.kind === "online"
          ? pick(
              locale,
              `Last update ${formatTimestamp(Date.now(), locale)}`,
              `最近更新 ${formatTimestamp(Date.now(), locale)}`,
            )
          : pick(locale, "Waiting for local status", "等待本地状态"),
      serviceBadge: serviceBadge(input.serviceState, input.snapshot, locale),
      summary:
        input.snapshot.kind !== "online"
          ? pick(locale, "Daemon offline", "本地服务离线")
          : companionView.summary,
    },
    home: {
      counts: {
        attention: companionView.counts.action,
        failedOrStale,
        running: companionView.counts.running,
        total: realSessions.length,
      },
      primaryAction: primaryAction(
        input.serviceState,
        input.snapshot,
        input.companion,
        locale,
      ),
      previewSessions,
      tagline: pick(locale, "Command Center", "代理指挥台"),
    },
    integrations,
    ...(input.notice ? { notice: input.notice } : {}),
    onboarding: {
      active: !input.preferences.onboardingCompleted,
      currentStepId: currentStepId(onboardingSteps),
      steps: onboardingSteps,
    },
    selectedSection: input.preferences.lastSection,
    sections,
    settings: {
      companionVisibilityPreference:
        input.preferences.companionVisibilityPreference,
      host: input.runtimeSettings.host,
      notifier: input.runtimeSettings.notifier,
      onboardingCompleted: input.preferences.onboardingCompleted,
      port: input.runtimeSettings.port,
      ...(input.preferences.preferredIntegration
        ? { preferredIntegration: input.preferences.preferredIntegration }
        : {}),
      serviceAutoStart: input.preferences.serviceAutoStart,
    },
    remote: {
      hosts: input.remoteHosts,
    },
  };
}
