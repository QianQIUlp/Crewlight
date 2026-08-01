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
  isSyntheticDemoSession,
  localizeSessionActivity,
  localizeSessionSource,
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
    doctor: "Troubleshooting",
    agents: "Connect",
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
  return new Date(timestamp).toLocaleTimeString(
    locale === "zh-CN" ? "zh-CN" : "en",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
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
    en: "Checking the project",
    "zh-CN": "检查项目",
  },
  "[Demo] Updating README": {
    en: "Updating a document",
    "zh-CN": "更新文档",
  },
  "[Demo] Reviewing companion UI": {
    en: "Reviewing the Crewlight window",
    "zh-CN": "检查 Crewlight 界面",
  },
  "[Demo] Adapter smoke check": {
    en: "Checking a connection",
    "zh-CN": "检查接入状态",
  },
  "[Demo] Local setup validation": {
    en: "Checking local setup",
    "zh-CN": "检查本机配置",
  },
  "[Demo] Background dependency scan": {
    en: "Reviewing project files",
    "zh-CN": "检查项目文件",
  },
  "[Demo] Running tests": {
    en: "Checking the project",
    "zh-CN": "正在检查项目",
  },
  "[Demo] Permission to edit README": {
    en: "Permission to edit a file",
    "zh-CN": "请求编辑文件",
  },
  "[Demo] Companion review requested": {
    en: "Waiting for UI feedback",
    "zh-CN": "等待界面反馈",
  },
  "[Demo] Adapter smoke completed": {
    en: "Connection check completed",
    "zh-CN": "接入检查已完成",
  },
  "[Demo] Local setup failed": {
    en: "Setup check failed",
    "zh-CN": "配置检查失败",
  },
  "[Demo] Background scan last reported": {
    en: "Project check last updated",
    "zh-CN": "项目检查最后更新",
  },
  "Crewlight Demo": {
    en: "Crewlight Demo",
    "zh-CN": "Crewlight 演示",
  },
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
      ? `最近一次更新在 ${formatRelativeAge(session.lastEventAgeMs, locale)}，任务可能已停滞`
      : `Last update ${formatRelativeAge(session.lastEventAgeMs, locale)}; this task may be stuck`;
  }
  return undefined;
}

function toSessionCard(
  session: SanitizedSession,
  locale: DesktopLocale,
): DesktopSessionCard {
  const hint = diagnosticHint(session, locale);
  const demo = isSyntheticDemoSession(session);
  const activity = localizeSessionActivity(session, locale);
  const title = session.taskTitle ?? session.displayWorkspace;
  return {
    id: session.viewId,
    activity: demo ? localizeDemoText(activity, locale) : activity,
    ageLabel: formatRelativeAge(session.lastEventAgeMs, locale),
    ...(demo ? { demoLabel: pick(locale, "Demo", "演示") } : {}),
    ...(hint ? { diagnosticHint: hint } : {}),
    needsAction: needsAction(session),
    source: localizeSessionSource(session, locale),
    statusLabel: STATUS_LABELS[locale][session.status],
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
      return pick(locale, "Review existing setup", "请先检查现有配置");
    }
    if (status === "unavailable") {
      return pick(
        locale,
        "Move Crewlight to a simpler folder",
        "请将 Crewlight 移到更简单的路径",
      );
    }
    if (status === "error") {
      return pick(locale, "Setup check failed", "配置检查失败");
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
        "Crewlight changes only its own settings and backs up the file first.",
        "Crewlight 只添加自己的配置，并会先备份原文件。",
      ),
      configureDisabled: configureDisabled(claudeStatus),
      configureLabel: configureLabel(claudeStatus),
      copySetupLabel: pick(locale, "Copy setup text", "复制配置内容"),
      copyVerificationLabel: pick(locale, "Copy check command", "复制检查命令"),
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
        "Crewlight reads local status only. It never reads prompts, approves permissions, or controls Codex.",
        "Crewlight 只读取本机状态，不读取提示词，也不会替你授权或控制 Codex。",
      ),
      configureDisabled: configureDisabled(codexStatus),
      configureLabel: configureLabel(codexStatus),
      copySetupLabel: pick(locale, "Copy setup text", "复制配置内容"),
      copyVerificationLabel: pick(locale, "Copy check command", "复制检查命令"),
      highlight: preferredIntegration === "codex",
      id: "codex",
      maturity: pick(locale, "Recommended", "推荐"),
      observed: observedSources.has("codex")
        ? pick(locale, "Receiving activity", "正在接收状态")
        : pick(locale, "Ready", "可以接入"),
      observes: pick(
        locale,
        "See live Codex status immediately. Configure once to also see permission requests.",
        "立即查看 Codex 状态；一键配置后还可显示授权提醒。",
      ),
      setupCommand: setup.codexHooks,
      setupStatus: observedSources.has("codex")
        ? pick(locale, "Live activity detected", "已检测到实时活动")
        : setupLabel(codexStatus),
      title: "Codex",
      verificationCommand: setup.verification.codex,
    },
    {
      boundary: pick(
        locale,
        "Automatic live updates are not available yet. Crewlight never reads private Cursor data.",
        "暂不支持自动实时更新；Crewlight 不会读取 Cursor 的私有数据。",
      ),
      copySetupLabel: pick(locale, "Copy setup steps", "复制接入步骤"),
      copyVerificationLabel: pick(locale, "Copy check command", "复制检查命令"),
      highlight: preferredIntegration === "cursor",
      id: "cursor",
      maturity: pick(locale, "Manual setup", "手动接入"),
      observed: observedSources.has("cursor")
        ? pick(locale, "Activity detected", "已检测到活动")
        : pick(locale, "Setup available", "可以接入"),
      observes: pick(
        locale,
        "Shows status sent by Cursor tasks or its terminal.",
        "显示 Cursor 任务或终端主动发送的状态。",
      ),
      setupCommand: setup.cursor,
      setupStatus: observedSources.has("cursor")
        ? pick(locale, "Live activity detected", "已检测到实时活动")
        : pick(locale, "Setup text ready", "接入内容已就绪"),
      title: "Cursor",
      verificationCommand: setup.verification.cursor,
    },
    {
      boundary: pick(
        locale,
        "Crewlight receives only local status updates from the OpenCode plugin.",
        "Crewlight 只接收 OpenCode 插件在本机发送的状态。",
      ),
      copySetupLabel: pick(locale, "Copy plugin setup", "复制插件配置"),
      highlight: preferredIntegration === "opencode",
      id: "opencode",
      maturity: pick(locale, "Preview", "预览"),
      observed: observedSources.has("opencode")
        ? pick(locale, "Activity detected", "已检测到活动")
        : pick(locale, "Plugin setup available", "可以配置插件"),
      observes: pick(
        locale,
        "Shows work, permission requests, completion, and failures.",
        "显示工作、授权提醒、完成和失败状态。",
      ),
      setupCommand: setup.openCode,
      setupStatus: observedSources.has("opencode")
        ? pick(locale, "Live activity detected", "已检测到实时活动")
        : pick(locale, "Plugin setup ready", "插件配置已就绪"),
      title: "OpenCode",
    },
    {
      boundary: pick(
        locale,
        "Crewlight shows only the updates you explicitly send and never controls another app.",
        "Crewlight 只显示你主动发送的状态，不会控制其他应用。",
      ),
      copySetupLabel: pick(locale, "Copy example command", "复制示例命令"),
      copyVerificationLabel: pick(locale, "Copy check command", "复制检查命令"),
      highlight: preferredIntegration === "manual",
      id: "manual",
      maturity: pick(locale, "Advanced", "高级"),
      observed:
        observedSources.has("custom") || observedSources.has("generic-cli")
          ? pick(locale, "Activity detected", "已检测到活动")
          : pick(locale, "Manual setup available", "可以手动接入"),
      observes: pick(
        locale,
        "Connect another tool by sending its status to Crewlight.",
        "让其他工具主动把状态发送给 Crewlight。",
      ),
      setupCommand: setup.antigravityProbe,
      setupStatus:
        observedSources.has("custom") || observedSources.has("generic-cli")
          ? pick(locale, "Live activity detected", "已检测到实时活动")
          : pick(locale, "Example ready", "示例已就绪"),
      title: pick(locale, "Other tools", "其他工具"),
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
      label: pick(locale, "Starting Crewlight", "正在启动 Crewlight"),
      tone: "active",
    };
  }
  if (serviceState.phase === "stopping") {
    return {
      label: pick(locale, "Stopping Crewlight", "正在停止 Crewlight"),
      tone: "warning",
    };
  }
  if (serviceState.phase === "running") {
    return {
      label: pick(locale, "Crewlight is running", "Crewlight 运行中"),
      tone: "success",
    };
  }
  if (snapshot.kind === "online") {
    return {
      label: pick(locale, "Crewlight is already running", "Crewlight 已在运行"),
      tone: "active",
    };
  }
  if (serviceState.phase === "error") {
    return {
      label: pick(locale, "Crewlight needs attention", "Crewlight 需要处理"),
      tone: "error",
    };
  }
  return {
    label: pick(locale, "Crewlight is off", "Crewlight 未启动"),
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
        "Start Crewlight to see live agent activity.",
        "启动 Crewlight，查看代理的实时状态。",
      ),
      label: pick(locale, "Start Crewlight", "启动 Crewlight"),
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
        "See every agent's status in one place.",
        "在一个地方看清所有代理的状态。",
      ),
      complete: true,
    },
    {
      id: "start-service",
      title: pick(locale, "Start Crewlight", "启动 Crewlight"),
      description: pick(
        locale,
        "Start Crewlight on this computer.",
        "在这台电脑上启动 Crewlight。",
      ),
      complete:
        input.serviceState.phase === "running" ||
        input.snapshot.kind === "online",
    },
    {
      id: "choose-integration",
      title: pick(locale, "Choose an agent", "选择代理"),
      description: pick(
        locale,
        "Choose the agent you want to connect first.",
        "选择你想先接入的代理。",
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
        "Open the companion to keep status in view.",
        "打开悬浮伴侣，让状态一直可见。",
      ),
      complete: input.companion.visible,
    },
    {
      id: "finish",
      title: pick(locale, "Finish", "完成"),
      description: pick(
        locale,
        "Go to Home without changing what is already running.",
        "进入首页，不打断正在运行的任务。",
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
              "状态只在本机处理",
              "不会控制你的代理",
              "不会替你批准权限",
              "不会保存提示词或对话",
            ]
          : [
              "Status stays on this computer",
              "Doesn't control your agents",
              "Doesn't approve permissions for you",
              "Doesn't save prompts or conversations",
            ],
      license: "MIT",
      migrationSummary:
        locale === "zh-CN"
          ? [
              "AgentPulse 现已更名为 Crewlight。",
              "Crewlight 桌面版是主要应用。",
              "高级接入仍可通过命令行完成。",
            ]
          : [
              "AgentPulse is now Crewlight.",
              "Crewlight Desktop is the main app.",
              "Advanced setup remains available from the command line.",
            ],
      repoUrl: "https://github.com/QianQIUlp/Crewlight",
      tagline: pick(
        locale,
        "See what your coding agents are doing, at a glance.",
        "一眼看清 AI 编码代理正在做什么。",
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
              `${demoSessions.length} sample sessions are active. Run the demo again to refresh them.`,
              `${demoSessions.length} 个示例会话正在运行。再次运行演示即可刷新。`,
            )
          : pick(
              locale,
              "Run the demo to preview a few sample agent states.",
              "运行演示，预览几种代理状态。",
            ),
    },
    doctor: {
      checks: input.doctorReport.checks,
      platformLabel: platformLabel(),
      summary: input.doctorReport.ok
        ? pick(
            locale,
            "Everything Crewlight needs is ready.",
            "Crewlight 所需项目均已就绪。",
          )
        : pick(locale, "Some items need attention.", "有些项目需要处理。"),
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
          ? pick(locale, "Crewlight is off", "Crewlight 未启动")
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
      tagline: pick(locale, "Activity overview", "工作状态"),
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
