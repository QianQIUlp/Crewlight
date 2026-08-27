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
  sortSessions,
} from "./state.js";
import type { SanitizedSession } from "./sanitize.js";

const STATUS_LABELS: Record<SanitizedSession["status"], string> = {
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

const SECTION_LABELS: Record<DesktopSection, string> = {
  home: "Home",
  connect: "Connect",
  troubleshooting: "Troubleshooting",
  settings: "Settings",
};

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
  action: "run-demo" | "show-companion" | "start-service";
  description: string;
  label: string;
}

export interface DesktopOnboardingStep {
  complete: boolean;
  description: string;
  id:
    | "welcome"
    | "start-service"
    | "choose-integration"
    | "trust-or-setup"
    | "first-real-event"
    | "finish";
  title: string;
}

export interface DesktopIntegrationCard {
  boundary: string;
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
    sessions: DesktopSessionCard[];
    tagline: string;
  };
  integrations: DesktopIntegrationCard[];
  experimentalIntegrations: DesktopIntegrationCard[];
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
    integrationSetupCompleted: boolean;
    port: number;
    preferredIntegration?: PreferredIntegration;
    serviceAutoStart: boolean;
    locale: DesktopLocale;
    readyDismissedBefore?: number;
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
}

function formatRelativeAge(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function formatTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return "Waiting for local status";
  }
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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

function isDemoSession(session: SanitizedSession): boolean {
  return session.sessionKey.includes("demo:");
}

function sessionTone(session: SanitizedSession): DesktopSessionCard["tone"] {
  if (needsAction(session)) {
    return "attention";
  }
  if (isError(session)) {
    return "error";
  }
  if (session.priority === "stale") {
    return "stale";
  }
  if (isRunning(session)) {
    return "active";
  }
  return "quiet";
}

function diagnosticHint(session: SanitizedSession): string | undefined {
  if (session.status === "waiting_permission") {
    return "Permission required";
  }
  if (session.status === "waiting_input") {
    return "User input requested";
  }
  if (session.status === "failed") {
    return "Agent reported a failure";
  }
  if (session.status === "rate_limited") {
    return "Rate limit reported";
  }
  if (session.priority === "stale") {
    return "No recent event; session may be stale";
  }
  return undefined;
}

function toSessionCard(session: SanitizedSession): DesktopSessionCard {
  return {
    id: session.viewId,
    activity: session.activityLabel ?? STATUS_LABELS[session.status],
    ageLabel: formatRelativeAge(session.lastEventAgeMs),
    ...(diagnosticHint(session)
      ? { diagnosticHint: diagnosticHint(session) }
      : {}),
    needsAction: needsAction(session),
    source: session.displayName,
    statusLabel: STATUS_LABELS[session.status],
    surface: getCompanionSurfaceLabel(session.surface),
    title: session.taskTitle ?? session.displayWorkspace,
    tone: sessionTone(session),
    workspace: session.displayWorkspace,
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
): {
  formal: DesktopIntegrationCard[];
  experimental: DesktopIntegrationCard[];
} {
  const observedSources = new Set(sessions.map((session) => session.source));
  const cards: DesktopIntegrationCard[] = [
    {
      boundary:
        "Observes documented Claude Code lifecycle hooks without modifying Claude settings.",
      copySetupLabel: "Copy setup snippet",
      copyVerificationLabel: "Copy verification command",
      highlight: preferredIntegration === "claude-code",
      id: "claude-code",
      maturity: "Precise",
      observed: observedSources.has("claude-code")
        ? "Observed in current daemon"
        : "Ready to configure",
      observes:
        "Session start, prompts, notifications, permissions, tools, stop, and failures.",
      setupCommand: setup.claudeCode,
      setupStatus: observedSources.has("claude-code")
        ? "Live activity detected"
        : "Mergeable snippet ready",
      title: "Claude Code",
      verificationCommand: setup.verification.claudeCode,
    },
    {
      boundary:
        "Observes Codex notify and hooks only. Crewlight does not approve permissions or return turn-control output.",
      copySetupLabel: "Copy setup snippet",
      copyVerificationLabel: "Copy verification command",
      highlight: preferredIntegration === "codex",
      id: "codex",
      maturity: "Precise lifecycle",
      observed: observedSources.has("codex")
        ? "Observed in current daemon"
        : "Ready to configure",
      observes:
        "Session, prompt, tool, permission, and stop events after trust review.",
      setupCommand: setup.codexHooks,
      setupStatus: observedSources.has("codex")
        ? "Live activity detected"
        : "Hooks snippet ready",
      title: "Codex",
      verificationCommand: setup.verification.codex,
    },
    {
      boundary:
        "Experimental integrations stay collapsed in v0.5. They are not part of the supported Windows contract.",
      copySetupLabel: "Copy setup commands",
      copyVerificationLabel: "Copy verification command",
      highlight: preferredIntegration === "cursor",
      id: "cursor",
      maturity: "Experimental",
      observed: observedSources.has("cursor") ? "Observed" : "Not connected",
      observes: "Manual or source-specific events only.",
      setupCommand: setup.cursor,
      setupStatus: "Experimental; no one-click install",
      title: "Cursor",
      verificationCommand: setup.verification.cursor,
    },
    {
      boundary:
        "Experimental integrations are retained for diagnosis and manual ingest only.",
      copySetupLabel: "Copy setup commands",
      highlight: false,
      id: "opencode",
      maturity: "Experimental",
      observed: observedSources.has("opencode") ? "Observed" : "Not connected",
      observes: "Documented local plugin events when manually configured.",
      setupCommand: setup.openCode,
      setupStatus: "Experimental; no one-click install",
      title: "OpenCode",
    },
    {
      boundary:
        "Manual ingest remains available for troubleshooting and development.",
      copySetupLabel: "Copy ingest command",
      copyVerificationLabel: "Copy verification command",
      highlight: preferredIntegration === "manual",
      id: "manual",
      maturity: "Experimental",
      observed:
        observedSources.has("custom") || observedSources.has("generic-cli")
          ? "Observed"
          : "Not connected",
      observes: "Explicit normalized events only.",
      setupCommand: setup.antigravityProbe,
      setupStatus: "Experimental; no one-click install",
      title: "Manual ingest",
      verificationCommand: setup.verification.antigravityProbe,
    },
  ];
  return {
    formal: cards.filter(
      (card) => card.id === "claude-code" || card.id === "codex",
    ),
    experimental: cards.filter(
      (card) => card.id !== "claude-code" && card.id !== "codex",
    ),
  };
}

function serviceBadge(
  serviceState: ManagedServiceState,
  snapshot: DesktopDashboardResult,
): DesktopStatusBadge {
  if (serviceState.phase === "starting") {
    return { label: "Starting local service", tone: "active" };
  }
  if (serviceState.phase === "stopping") {
    return { label: "Stopping local service", tone: "warning" };
  }
  if (serviceState.phase === "running") {
    return { label: "Managed local service", tone: "success" };
  }
  if (snapshot.kind === "online") {
    return { label: "External local service detected", tone: "active" };
  }
  if (serviceState.phase === "error") {
    return { label: "Local service needs attention", tone: "error" };
  }
  return { label: "Local service stopped", tone: "neutral" };
}

function primaryAction(
  serviceState: ManagedServiceState,
  snapshot: DesktopDashboardResult,
  companion: DesktopCompanionState,
  demoSessions: readonly SanitizedSession[],
): DesktopActionCard {
  if (serviceState.phase !== "running" && snapshot.kind !== "online") {
    return {
      action: "start-service",
      description:
        "Start the local daemon and dashboard so Crewlight can watch live sessions.",
      label: "Start local service",
    };
  }
  return {
    action: "show-companion",
    description: companion.visible
      ? "Bring the floating companion forward for a quick status read."
      : "Show the floating companion to keep live status visible while you work elsewhere.",
    label: companion.visible ? "Bring companion forward" : "Show companion",
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
  const liveSessions =
    input.snapshot.kind === "online" ? input.snapshot.data.sessions : [];
  const sortedSessions = sortSessions(
    liveSessions.filter(
      (session) =>
        session.priority !== "hidden" &&
        !(
          session.priority === "ready" &&
          input.preferences.readyDismissedBefore !== undefined &&
          session.lastEventAt <= input.preferences.readyDismissedBefore
        ),
    ),
  );
  const demoSessions = sortedSessions.filter(isDemoSession);
  const companionSessions = liveSessions.filter(
    (session) =>
      !(
        session.priority === "ready" &&
        input.preferences.readyDismissedBefore !== undefined &&
        session.lastEventAt <= input.preferences.readyDismissedBefore
      ),
  );
  const companionView = deriveCompanionViewModel(
    input.snapshot.kind === "online"
      ? { kind: "online", data: { sessions: companionSessions } }
      : input.snapshot,
  );
  const homeSessions = sortedSessions.map(toSessionCard);
  const failedOrStale = sortedSessions.filter(
    (session) => isError(session) || session.priority === "stale",
  ).length;
  const sections = Object.entries(SECTION_LABELS).map(([id, label]) => ({
    active: input.preferences.lastSection === id,
    id: id as DesktopSection,
    label,
  }));
  const hasFormalRealEvent = liveSessions.some(
    (session) =>
      !isDemoSession(session) &&
      (session.source === "claude-code" || session.source === "codex"),
  );
  const onboardingSteps: DesktopOnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome",
      description: "Meet Crewlight Desktop and the local-first workflow.",
      complete: true,
    },
    {
      id: "start-service",
      title: "Start local service",
      description: "Bring up the loopback daemon and dashboard API.",
      complete:
        input.serviceState.phase === "running" ||
        input.snapshot.kind === "online",
    },
    {
      id: "choose-integration",
      title: "Choose Claude Code or Codex",
      description: "Choose the first supported integration to configure.",
      complete:
        input.preferences.preferredIntegration === "claude-code" ||
        input.preferences.preferredIntegration === "codex",
    },
    {
      id: "trust-or-setup",
      title: "Check and trust the definition",
      description:
        "Install the safe user-level hook, then review it in Claude Code or Codex /hooks. Installation is not a connection test.",
      complete: input.preferences.integrationSetupCompleted,
    },
    {
      id: "first-real-event",
      title: "Run a real turn",
      description: "Run a real session and wait for the first non-demo event.",
      complete: hasFormalRealEvent,
    },
    {
      id: "finish",
      title: "Finish",
      description: "Land in Home after the first real event is visible.",
      complete: input.preferences.onboardingCompleted && hasFormalRealEvent,
    },
  ];
  const integrationSets = integrationCards(
    sortedSessions,
    input.preferences.preferredIntegration,
    setup,
  );

  return {
    about: {
      boundaries: [
        "No cloud service",
        "No private API scraping",
        "No automatic permission approval",
        "No prompt, transcript, or tool I/O retention",
      ],
      license: "MIT",
      migrationSummary: [
        "Crewlight is a local, read-only Attention Inbox for multi-agent work.",
        "Windows 11 x64 is Supported; Linux and macOS are Preview; Remote is Beta.",
        "CLI and browser dashboard remain developer surfaces, not additional product categories.",
      ],
      repoUrl: "https://github.com/QianQIUlp/Crewlight",
      tagline: "Attention Inbox for multi-agent work.",
      version: input.version,
    },
    appearance: {
      accent: input.preferences.accent,
      density: input.preferences.density,
      theme: input.preferences.theme,
    },
    companion: {
      ...input.companion,
      modeLabel: input.companion.expanded ? "Expanded mode" : "Compact mode",
      statusLabel: input.companion.visible ? "Visible" : "Hidden",
    },
    demo: {
      hasSyntheticSessions: demoSessions.length > 0,
      sessions: demoSessions.map(toSessionCard),
      summary:
        demoSessions.length > 0
          ? `${demoSessions.length} synthetic local sessions are active. Rerun the demo to refresh the same identities.`
          : "Run the local multi-agent demo to populate Home, Demo, and Companion with synthetic sessions.",
    },
    doctor: {
      checks: input.doctorReport.checks,
      platformLabel: platformLabel(),
      summary: input.doctorReport.ok
        ? "Doctor checks look healthy for the current local setup."
        : "Doctor found follow-up items before release or daily use.",
    },
    header: {
      lastUpdatedLabel:
        input.snapshot.kind === "online"
          ? `Last update ${formatTimestamp(Date.now())}`
          : "Waiting for local status",
      serviceBadge: serviceBadge(input.serviceState, input.snapshot),
      summary: companionView.summary,
    },
    home: {
      counts: {
        attention: companionView.counts.action,
        failedOrStale,
        running: companionView.counts.running,
        total: sortedSessions.length,
      },
      primaryAction: primaryAction(
        input.serviceState,
        input.snapshot,
        input.companion,
        demoSessions,
      ),
      sessions: homeSessions,
      tagline: "Your local Agent Attention Inbox",
    },
    integrations: integrationSets.formal,
    experimentalIntegrations: integrationSets.experimental,
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
      integrationSetupCompleted: input.preferences.integrationSetupCompleted,
      port: input.runtimeSettings.port,
      ...(input.preferences.preferredIntegration
        ? { preferredIntegration: input.preferences.preferredIntegration }
        : {}),
      serviceAutoStart: input.preferences.serviceAutoStart,
      locale: input.preferences.locale,
      ...(input.preferences.readyDismissedBefore !== undefined
        ? { readyDismissedBefore: input.preferences.readyDismissedBefore }
        : {}),
    },
    remote: {
      hosts: input.remoteHosts,
    },
  };
}
