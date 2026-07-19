import type { DoctorCheck, DoctorReport } from "@crewlight/cli";
import type { NotifierKind } from "@crewlight/notifier";

import type { DesktopDashboardResult } from "./desktop-client.js";
import type {
  DesktopAccent,
  DesktopDensity,
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
  completed: "Completed",
  failed: "Failed",
  rate_limited: "Rate limited",
  unknown: "Unknown",
};

const SECTION_LABELS: Record<DesktopSection, string> = {
  home: "Home",
  doctor: "Doctor",
  agents: "Agents",
  companion: "Companion",
  demo: "Demo",
  appearance: "Appearance",
  settings: "Settings",
  about: "About",
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
    | "run-demo"
    | "show-companion"
    | "choose-integration"
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
  return (
    session.taskTitle?.startsWith("[Demo]") === true ||
    session.activityLabel?.startsWith("[Demo]") === true
  );
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
  if (session.isStale && isRunning(session)) {
    return session.staleReason ?? "No recent event; session may be stale";
  }
  return undefined;
}

function toSessionCard(session: SanitizedSession): DesktopSessionCard {
  return {
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
): DesktopIntegrationCard[] {
  const observedSources = new Set(sessions.map((session) => session.source));
  return [
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
  if (demoSessions.length === 0) {
    return {
      action: "run-demo",
      description:
        "Load the deterministic multi-agent scenario to populate Home, Demo, and Companion instantly.",
      label: "Run multi-agent demo",
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
  const sortedSessions = sortSessions(liveSessions);
  const demoSessions = sortedSessions.filter(isDemoSession);
  const companionView = deriveCompanionViewModel(
    input.snapshot.kind === "online"
      ? { kind: "online", data: { sessions: liveSessions } }
      : input.snapshot,
  );
  const previewSessions = sortedSessions.slice(0, 4).map(toSessionCard);
  const failedOrStale = sortedSessions.filter(
    (session) => isError(session) || (session.isStale && isRunning(session)),
  ).length;
  const sections = Object.entries(SECTION_LABELS).map(([id, label]) => ({
    active: input.preferences.lastSection === id,
    id: id as DesktopSection,
    label,
  }));
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
      id: "run-demo",
      title: "Run demo",
      description:
        "Load six deterministic local sessions to see the product loop.",
      complete: demoSessions.length > 0,
    },
    {
      id: "show-companion",
      title: "Show companion",
      description: "Open the floating companion so live status stays nearby.",
      complete: input.companion.visible,
    },
    {
      id: "choose-integration",
      title: "Choose an integration path",
      description: "Pick the first setup path you want Crewlight to highlight.",
      complete: input.preferences.preferredIntegration !== undefined,
    },
    {
      id: "finish",
      title: "Finish",
      description: "Land in Home and keep the current local state intact.",
      complete: input.preferences.onboardingCompleted,
    },
  ];
  const integrations = integrationCards(
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
        "AgentPulse is now Crewlight.",
        "The desktop app is the primary user-facing v0.5.0 surface.",
        "CLI and browser dashboard remain available for advanced local workflows.",
      ],
      repoUrl: "https://github.com/QianQIUlp/Crewlight",
      tagline: "Local activity radar for AI coding agents.",
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
      previewSessions,
      tagline: "Command Center",
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
  };
}
