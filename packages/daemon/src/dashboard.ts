import type {
  AgentSession,
  AgentSource,
  AgentStatus,
  AgentSurface,
} from "@crewlight/core";
import type { NotifierKind } from "@crewlight/notifier";
import type { ServerResponse } from "node:http";

import type { CrewlightService } from "./service.js";

export type DashboardTaskTitleMode = "off" | "prompt-preview";

export interface DashboardCapabilities {
  taskTitleMode: DashboardTaskTitleMode;
}

export interface DashboardDoctorCheck {
  id: string;
  status: "ok" | "warning" | "error" | "skipped";
  message: string;
  action?: string;
}

export interface DashboardDoctorReport {
  ok: boolean;
  checks: DashboardDoctorCheck[];
}

export interface DashboardOptions {
  notifier: NotifierKind;
  taskTitleMode: DashboardTaskTitleMode;
  setup: {
    claudeCode: string;
    codex: string;
    codexHooks: string;
    cursor: string;
    openCode: string;
    antigravityProbe: string;
    verification: {
      claudeCode: string;
      codex: string;
      cursor: string;
      antigravityProbe: string;
    };
  };
  doctor(): Promise<DashboardDoctorReport>;
}

export type DashboardAttention = "passive" | "done" | "action" | "error";
export type DashboardActionKind = "input" | "permission";

export interface DashboardSession {
  sessionKey: string;
  shortSessionKey: string;
  source: AgentSource;
  surface: AgentSurface;
  status: AgentStatus;
  lastEventAt: number;
  lastEventAgeMs: number;
  isStale: boolean;
  staleReason?: string;
  displayName: string;
  displayWorkspace: string;
  identityLine: string;
  taskTitle?: string;
  activityLabel?: string;
  durationMs: number;
  attention: DashboardAttention;
  actionKind?: DashboardActionKind;
  sessionId?: string;
  projectPath?: string;
  workspaceName?: string;
  startedAt?: number;
  completedAt?: number;
  lastMessage?: string;
  error?: string;
  remoteAlias?: string;
}

export interface DashboardApiResponse {
  health: {
    status: "ok";
    startedAt: number;
    uptimeMs: number;
  };
  notifier: NotifierKind;
  sessions: DashboardSession[];
  setup: {
    claudeCode: string;
    codex: string;
    codexHooks: string;
    cursor: string;
    openCode: string;
    antigravityProbe: string;
    verification?: {
      claudeCode: string;
      codex: string;
      cursor: string;
      antigravityProbe: string;
    };
  };
  doctor: DashboardDoctorReport;
}

const DISPLAY_NAMES: Record<AgentSource, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
  "vscode-agent": "VS Code Agent",
  "gemini-cli": "Gemini CLI",
  aider: "Aider",
  antigravity: "Antigravity",
  "generic-cli": "Generic CLI",
  "copilot-cli": "Copilot CLI",
  codebuddy: "CodeBuddy",
  "kiro-cli": "Kiro CLI",
  "kimi-cli": "Kimi CLI",
  "qwen-code": "Qwen Code",
  codewhale: "CodeWhale",
  "mimo-code": "MiMo Code",
  "pi-agent": "Pi",
  openclaw: "OpenClaw",
  "hermes-agent": "Hermes Agent",
  qoder: "Qoder",
  qoderwork: "QoderWork",
  "reasonix-cli": "Reasonix CLI",
  "opencode-compat": "OpenCode",
  custom: "Custom",
};

const SURFACE_LABELS: Record<AgentSurface, string> = {
  unknown: "Unknown",
  cli: "CLI",
  "ide-extension": "IDE extension",
  desktop: "Desktop",
  cloud: "Cloud",
  manual: "Manual",
};

const STALE_THRESHOLDS_MS: Partial<Record<AgentStatus, number>> = {
  running: 5 * 60 * 1000,
  using_tool: 5 * 60 * 1000,
  waiting_input: 10 * 60 * 1000,
  waiting_permission: 10 * 60 * 1000,
  unknown: 2 * 60 * 1000,
};

const ACTIVE_STATUSES = new Set<AgentStatus>([
  "running",
  "using_tool",
  "waiting_input",
  "waiting_permission",
]);

const DASHBOARD_TASK_TITLE_LIMIT = 120;

const ACTIVITY_LABELS: Record<string, string> = {
  SessionStart: "Session started",
  UserPromptSubmit: "Request submitted",
  PreToolUse: "Using tool",
  PostToolUse: "Tool completed",
  PermissionRequest: "Permission requested",
  Notification: "Attention requested",
  Stop: "Session completed",
  StopFailure: "Session failed",
  "agent-turn-complete": "Turn completed",
  "session.created": "Session started",
  "session.updated": "Session updated",
  "session.status": "Status updated",
  "session.idle": "Session completed",
  "session.error": "Session failed",
  "permission.asked": "Permission requested",
  "permission.replied": "Permission answered",
  "tool.execute.before": "Using tool",
  "tool.execute.after": "Tool completed",
  "message.updated": "Activity updated",
  "Command running": "Command running",
  "Command completed": "Command completed",
  "Command failed": "Command failed",
  DemoClaudeTests: "[Demo] Running tests",
  DemoCodexPermission: "[Demo] Permission to edit README",
  DemoCursorReview: "[Demo] Companion review requested",
  DemoOpenCodeComplete: "[Demo] Adapter smoke completed",
  DemoCustomSetupFailed: "[Demo] Local setup failed",
  DemoGenericStaleScan: "[Demo] Background scan last reported",
};

const STATUS_ACTIVITY_LABELS: Record<AgentStatus, string> = {
  idle: "Idle",
  running: "Running",
  using_tool: "Using tool",
  waiting_input: "Input requested",
  waiting_permission: "Permission requested",
  completed: "Session completed",
  failed: "Session failed",
  rate_limited: "Rate limited",
  unknown: "Status unknown",
};

export function getDisplayName(source: AgentSource): string {
  return DISPLAY_NAMES[source] ?? source;
}

export function getShortSessionKey(sessionKey: string): string {
  return sessionKey.slice(-8);
}

export function getSurfaceLabel(surface: AgentSurface): string {
  return SURFACE_LABELS[surface] ?? "Unknown";
}

export function getDisplayWorkspace(session: AgentSession): string {
  if (session.workspaceName) {
    return session.workspaceName;
  }

  if (session.projectPath) {
    const pathParts = session.projectPath
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .filter(Boolean);
    const basename = pathParts.at(-1);
    if (basename) {
      return basename;
    }
  }

  return "Unknown workspace";
}

export function getDashboardIdentityLine(session: AgentSession): string {
  return getDisplayWorkspace(session);
}

function cleanDashboardTaskTitle(value: string): string | undefined {
  const title = value.trim().replace(/\s+/g, " ");
  if (!title) {
    return undefined;
  }
  return title.length <= DASHBOARD_TASK_TITLE_LIMIT
    ? title
    : `${title.slice(0, DASHBOARD_TASK_TITLE_LIMIT - 1)}…`;
}

export function getDashboardTaskTitle(
  session: AgentSession,
): string | undefined {
  return session.taskTitle
    ? cleanDashboardTaskTitle(session.taskTitle)
    : undefined;
}

export function getDashboardActivityLabel(session: AgentSession): string {
  return (
    (session.title ? ACTIVITY_LABELS[session.title] : undefined) ??
    STATUS_ACTIVITY_LABELS[session.status]
  );
}

export function getLastEventAgeMs(lastEventAt: number, now: number): number {
  return Math.max(0, now - lastEventAt);
}

export function getDashboardStaleState(
  status: AgentStatus,
  lastEventAgeMs: number,
): { isStale: boolean; staleReason?: string } {
  const thresholdMs = STALE_THRESHOLDS_MS[status];
  if (thresholdMs === undefined || lastEventAgeMs < thresholdMs) {
    return { isStale: false };
  }

  const thresholdMinutes = thresholdMs / (60 * 1000);
  return {
    isStale: true,
    staleReason: `No event for at least ${thresholdMinutes} minutes.`,
  };
}

export function getDashboardAttention(status: AgentStatus): {
  attention: DashboardAttention;
  actionKind?: DashboardActionKind;
} {
  switch (status) {
    case "waiting_input":
      return { attention: "action", actionKind: "input" };
    case "waiting_permission":
      return { attention: "action", actionKind: "permission" };
    case "completed":
      return { attention: "done" };
    case "failed":
    case "rate_limited":
      return { attention: "error" };
    case "idle":
    case "running":
    case "using_tool":
    case "unknown":
      return { attention: "passive" };
  }
}

export function getDashboardDurationMs(
  session: AgentSession,
  now: number,
): number {
  const start = session.startedAt ?? session.lastEventAt;
  let end = session.lastEventAt;

  if (ACTIVE_STATUSES.has(session.status)) {
    end = now;
  } else if (session.status === "completed" || session.status === "failed") {
    end = session.completedAt ?? session.lastEventAt;
  }

  return Math.max(0, end - start);
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Crewlight Live View</title>
    <link rel="stylesheet" href="/dashboard/styles.css">
  </head>
  <body>
    <main>
      <header>
        <div>
          <p class="eyebrow" data-i18n="header.eyebrow">Local agent activity</p>
          <h1>Crewlight</h1>
        </div>
        <div class="header-actions">
          <div
            id="language-switch"
            class="language-switch"
            role="group"
            aria-label="Language"
            data-i18n-aria-label="language.label"
          >
            <button id="locale-en" type="button" data-locale="en" aria-pressed="true">EN</button>
            <button id="locale-zh" type="button" data-locale="zh" aria-pressed="false">中文</button>
          </div>
          <button id="refresh" type="button" data-i18n="action.refresh">Refresh</button>
        </div>
      </header>
      <nav id="view-nav" class="view-nav" aria-label="Views" data-i18n-aria-label="nav.label">
        <a id="overview-link" href="/dashboard" data-i18n="nav.overview">Overview</a>
        <a id="compact-link" href="/dashboard?view=compact" data-i18n="nav.compact">Compact</a>
      </nav>
      <p id="request-status" class="request-status" aria-live="polite"></p>
      <section class="summary" aria-label="Crewlight summary" data-i18n-aria-label="summary.label">
        <article>
          <h2 data-i18n="summary.service">Crewlight</h2>
          <p id="health" data-i18n="common.loading">Loading…</p>
          <p id="uptime" class="muted"></p>
        </article>
        <article>
          <h2 data-i18n="summary.notifications">Notifications</h2>
          <p id="notifier" data-i18n="common.loading">Loading…</p>
        </article>
        <article>
          <h2 data-i18n="summary.tasks">Tasks</h2>
          <p id="session-count" data-i18n="common.loading">Loading…</p>
        </article>
        <article>
          <h2 data-i18n="summary.details">Details</h2>
          <ul class="capabilities-list">
            <li><span data-i18n="summary.taskNames">Task names</span>: <span id="cap-task-titles" data-i18n="common.loading">Loading…</span></li>
            <li><span data-i18n="summary.localAddress">Local address</span>: <span id="cap-endpoint" data-i18n="common.loading">Loading…</span></li>
            <li><span data-i18n="summary.updates">Updates</span>: <span id="cap-polling" data-i18n="common.loading">Loading…</span></li>
          </ul>
        </article>
      </section>
      <section id="focus-root" class="primary-view" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow" data-i18n="focus.eyebrow">Focus mode</p>
            <h2 data-i18n="focus.heading">Focused task</h2>
          </div>
          <a id="focus-return" href="/dashboard" data-i18n="focus.backOverview">Back to overview</a>
        </div>
        <div id="focused-session"></div>
      </section>
      <div id="overview-root">
        <section id="empty-state" class="empty-state primary-view" hidden>
          <p class="eyebrow" data-i18n="empty.eyebrow">Ready for activity</p>
          <h2 data-i18n="empty.heading">No activity yet</h2>
          <p data-i18n="empty.description">Crewlight is ready. Connect an agent to see its current status here.</p>
          <a href="#setup" data-i18n="empty.action">Review setup options</a>
        </section>
        <section id="action-section" class="primary-view" hidden>
          <div class="section-heading">
            <div>
              <p class="eyebrow" data-i18n="actionSection.eyebrow">Needs you</p>
              <h2 data-i18n="actionSection.heading">Action needed</h2>
            </div>
            <p id="action-count" class="section-count"></p>
          </div>
          <div id="action-needed" class="session-grid"></div>
        </section>
        <section id="overview-section" class="primary-view" hidden>
          <div class="section-heading">
            <div>
              <p class="eyebrow" data-i18n="overview.eyebrow">Overview</p>
              <h2 data-i18n="overview.heading">Task status</h2>
            </div>
          </div>
          <div id="sessions" class="session-grid"></div>
        </section>
      </div>
      <section id="compact-root" class="primary-view" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow" data-i18n="compact.eyebrow">Compact view</p>
            <h2 data-i18n="compact.heading">Task status</h2>
          </div>
        </div>
        <div id="compact-empty-state" class="empty-state" hidden>
          <h3 data-i18n="empty.heading">No activity yet</h3>
          <p data-i18n="empty.description">Crewlight is ready. Connect an agent to see its current status here.</p>
          <a href="#setup" data-i18n="empty.action">Review setup options</a>
        </div>
        <div id="compact-session-list" class="compact-session-list"></div>
      </section>
      <section id="setup" class="secondary-section">
        <h2 data-i18n="setup.heading">Manual setup</h2>
        <div class="setup-grid">
          <article>
            <h3>Claude Code</h3>
            <pre id="setup-claude"></pre>
            <p class="eyebrow verify-label" data-i18n="setup.check">Test connection</p>
            <pre id="verify-claude" class="verify-command"></pre>
          </article>
          <article>
            <h3 data-i18n="setup.codexStatus">Codex status</h3>
            <pre id="setup-codex"></pre>
            <p class="eyebrow verify-label" data-i18n="setup.check">Test connection</p>
            <pre id="verify-codex" class="verify-command"></pre>
          </article>
          <article>
            <h3 data-i18n="setup.codexPermissions">Codex permission reminders</h3>
            <pre id="setup-codex-hooks"></pre>
          </article>
          <article>
            <h3>Cursor</h3>
            <p class="muted" data-i18n="setup.cursorDescription">Cursor currently uses manual status updates from its terminal or user-defined tasks.</p>
            <pre id="setup-cursor"></pre>
            <p class="eyebrow verify-label" data-i18n="setup.check">Test connection</p>
            <pre id="verify-cursor" class="verify-command"></pre>
          </article>
          <article>
            <h3>OpenCode</h3>
            <pre id="setup-opencode"></pre>
            <p class="eyebrow verify-label" data-i18n="setup.check">Test connection</p>
            <p class="muted" data-i18n="setup.openCodeDescription">After installing the plugin, run an OpenCode task and watch for activity here.</p>
          </article>
          <article>
            <h3 data-i18n="setup.otherTools">Other tools</h3>
            <p class="muted" data-i18n="setup.otherDescription">Advanced manual example. This is not a supported one-click connection.</p>
            <pre id="setup-antigravity-probe"></pre>
            <p class="eyebrow verify-label" data-i18n="setup.check">Test connection</p>
            <pre id="verify-antigravity" class="verify-command"></pre>
          </article>
        </div>
      </section>
      <section id="connectivity" class="secondary-section">
        <h2 data-i18n="connections.heading">Connection status</h2>
        <div class="connectivity-grid">
          <article>
            <h3>Claude Code</h3>
            <p id="conn-claude" data-i18n="common.loading">Loading…</p>
          </article>
          <article>
            <h3>Codex</h3>
            <p id="conn-codex" data-i18n="common.loading">Loading…</p>
          </article>
          <article>
            <h3>Cursor</h3>
            <p id="conn-cursor" data-i18n="common.loading">Loading…</p>
          </article>
          <article>
            <h3>OpenCode</h3>
            <p id="conn-opencode" data-i18n="common.loading">Loading…</p>
          </article>
          <article>
            <h3 data-i18n="setup.otherTools">Other tools</h3>
            <p id="conn-antigravity" data-i18n="common.loading">Loading…</p>
          </article>
        </div>
      </section>
      <section id="doctor" class="secondary-section">
        <h2 data-i18n="doctor.heading">Troubleshooting</h2>
        <p id="doctor-summary"></p>
        <ul id="doctor-checks" class="checks"></ul>
      </section>
    </main>
    <script src="/dashboard/app.js" defer></script>
  </body>
</html>
`;

const DASHBOARD_CSS = `:root {
  color-scheme: dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  background: #0b1018;
  color: #e8eef7;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background:
    radial-gradient(circle at top left, #17304d 0, transparent 32rem),
    radial-gradient(circle at top right, #241b46 0, transparent 26rem),
    #0b1018;
}

main {
  width: min(1120px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 3.5rem;
}

header,
.summary,
.setup-grid,
.session-grid,
.connectivity-grid,
.checks {
  display: grid;
  gap: 1rem;
}

header {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.header-actions,
.language-switch {
  display: flex;
  align-items: center;
}

.header-actions {
  gap: 0.65rem;
}

.language-switch {
  gap: 0.15rem;
  padding: 0.18rem;
  border: 1px solid #3d5672;
  border-radius: 999px;
  background: #0e1928;
}

.language-switch button {
  min-width: 2.7rem;
  border: 0;
  padding: 0.42rem 0.65rem;
  background: transparent;
  color: #a9bad0;
}

.language-switch button[aria-pressed="true"] {
  background: #274464;
  color: #f4f8fc;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: clamp(2.4rem, 7vw, 4.4rem);
  letter-spacing: -0.06em;
}

h2 {
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

a {
  color: #a8cff7;
}

a:focus-visible,
button:focus-visible {
  outline: 2px solid #d6e9ff;
  outline-offset: 3px;
}

.eyebrow,
.muted,
.request-status,
.section-count {
  color: #91a4bd;
}

.eyebrow {
  margin-bottom: 0.35rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

button {
  border: 1px solid #5d7898;
  border-radius: 999px;
  padding: 0.65rem 1rem;
  background: #122135;
  color: inherit;
  cursor: pointer;
}

button:hover,
button:focus-visible {
  background: #1c3657;
}

.view-nav {
  display: flex;
  gap: 0.35rem;
  margin-top: 1.25rem;
}

.view-nav a {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  color: #a9bad0;
  text-decoration: none;
}

.view-nav a:hover,
.view-nav a:focus-visible {
  background: #14243a;
  color: #e8eef7;
}

.view-nav a[aria-current="page"] {
  border-color: #58799f;
  background: #172b45;
  color: #f4f8fc;
}

section {
  margin-top: 1.75rem;
}

.primary-view {
  margin-top: 2.25rem;
}

.summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

article,
section > .checks,
.empty-state {
  border: 1px solid #27384d;
  border-radius: 0.9rem;
  background: rgb(14 23 35 / 88%);
}

article {
  padding: 1rem;
}

.summary article p:not(.muted) {
  margin-bottom: 0.25rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.section-heading {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.85rem;
  align-items: end;
  margin-bottom: 0.75rem;
}

.section-heading h2,
.section-heading p,
.empty-state h2 {
  margin-bottom: 0;
}

.session-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
}

.session-card {
  position: relative;
  min-height: 13.5rem;
  border-color: #30465f;
  border-top-width: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.session-card.attention-action {
  border-color: #f0b35c;
  background: linear-gradient(145deg, rgb(62 43 19 / 96%), rgb(18 27 39 / 96%));
  box-shadow: 0 0.8rem 2rem rgb(4 8 13 / 30%);
}

.session-card.attention-error {
  border-color: #ef776f;
  background: linear-gradient(145deg, rgb(53 27 30 / 92%), rgb(18 27 39 / 92%));
}

.session-card.attention-done {
  border-color: #4f8067;
  background: rgb(15 25 34 / 78%);
}

.session-card.attention-passive {
  border-color: #293d53;
  background: rgb(14 23 35 / 76%);
}

.session-card.status-unknown {
  border-color: #6c7685;
  border-style: dashed;
  background: rgb(24 29 37 / 88%);
}

.session-card.is-stale {
  border-right-style: dashed;
  border-bottom-style: dashed;
  border-left-style: dashed;
}

.session-card.expanded {
  min-height: 20rem;
}

.card-heading {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  align-items: start;
}

.card-heading h3 {
  margin-bottom: 0.2rem;
  font-size: 1.35rem;
}

.task-title {
  margin-bottom: 0.2rem;
  color: #d8e2ef;
  font-weight: 650;
  line-height: 1.35;
}

.status-badge {
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  color: #a8cff7;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.attention-action .status-badge {
  color: #f7c67f;
}

.attention-error .status-badge {
  color: #ff9992;
}

.attention-done .status-badge {
  color: #8fd7ad;
}

.status-unknown .status-badge {
  color: #b2bac7;
}

.activity-label {
  flex: 1;
  margin-bottom: 0;
  color: #aebed0;
  font-size: 0.88rem;
  line-height: 1.4;
}

.card-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin: 0;
}

.card-meta div {
  padding-top: 0.65rem;
  border-top: 1px solid #31445b;
}

.card-meta dt {
  color: #91a4bd;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.card-meta dd {
  margin: 0.2rem 0 0;
}

.focus-link {
  align-self: flex-start;
  font-weight: 700;
}

.confidence-note {
  margin-bottom: 0;
  color: #b2bac7;
  font-size: 0.88rem;
}

.stale-note {
  margin-bottom: 0;
  color: #c7b88e;
  font-size: 0.88rem;
}

.compact-session-list {
  display: grid;
  gap: 0.45rem;
}

.compact-session-row {
  display: grid;
  grid-template-columns: minmax(14rem, 1.3fr) minmax(10rem, 1fr) auto;
  gap: 1rem;
  align-items: center;
  min-width: 0;
  border: 1px solid #26394e;
  border-left-width: 0.25rem;
  border-radius: 0.7rem;
  padding: 0.75rem 0.85rem;
  background: rgb(14 23 35 / 82%);
  color: inherit;
  text-decoration: none;
}

.compact-session-row:hover,
.compact-session-row:focus-visible {
  border-color: #5f83aa;
  background: rgb(21 35 53 / 94%);
}

.compact-session-row.attention-action {
  border-left-color: #f0b35c;
  background: linear-gradient(90deg, rgb(53 38 20 / 92%), rgb(14 23 35 / 86%));
}

.compact-session-row.attention-error {
  border-left-color: #ef776f;
}

.compact-session-row.attention-done {
  border-left-color: #4f8067;
  color: #c4cfdb;
}

.compact-session-row.attention-passive {
  border-left-color: #36526f;
}

.compact-session-row.is-stale {
  border-top-style: dashed;
  border-right-style: dashed;
  border-bottom-style: dashed;
}

.compact-primary,
.compact-activity,
.compact-meta {
  min-width: 0;
}

.compact-heading {
  display: flex;
  gap: 0.55rem;
  align-items: center;
  margin-bottom: 0.25rem;
}

.compact-heading h3,
.compact-primary p,
.compact-activity,
.compact-meta p {
  margin-bottom: 0;
}

.compact-heading h3 {
  overflow: hidden;
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-identity {
  overflow: hidden;
  color: #91a4bd;
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-attention {
  color: #b7c7d9;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.attention-action .compact-attention {
  color: #f7c67f;
}

.attention-error .compact-attention {
  color: #ff9992;
}

.compact-activity {
  overflow: hidden;
  color: #aebed0;
  font-size: 0.9rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-meta {
  display: grid;
  gap: 0.2rem;
  justify-items: end;
  color: #9eafc3;
  font-size: 0.78rem;
  white-space: nowrap;
}

.compact-stale {
  color: #c7b88e;
  font-weight: 700;
}

.empty-state {
  padding: clamp(1.5rem, 5vw, 3.5rem);
  text-align: center;
}

.empty-state p:not(.eyebrow) {
  max-width: 38rem;
  margin-right: auto;
  margin-left: auto;
  color: #b8c7d9;
}

.setup-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.secondary-section {
  margin-top: 2.75rem;
  color: #c5d0dd;
}

.secondary-section > h2 {
  color: #91a4bd;
}

.secondary-section article,
.secondary-section > .checks {
  border-color: #223247;
  background: rgb(12 20 31 / 72%);
}

pre {
  overflow-x: auto;
  margin-bottom: 0;
  padding: 0.9rem;
  border-radius: 0.55rem;
  background: #090e15;
  white-space: pre-wrap;
  word-break: break-word;
}

.capabilities-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.capabilities-list li {
  color: #a9b7c6;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
.capabilities-list span {
  color: #e8eef7;
  font-weight: 500;
}
.verify-label {
  margin-top: 1rem;
  margin-bottom: 0.25rem;
}
.verify-command {
  margin-top: 0;
  background: #0b1018;
}

.checks {
  margin-bottom: 0;
  padding: 0.25rem 1.1rem;
  list-style: none;
}

.checks li {
  padding: 0.8rem 0;
  border-bottom: 1px solid #27384d;
}

.checks li:last-child {
  border-bottom: 0;
}

.check-status {
  margin-right: 0.5rem;
  color: #8fd7ad;
  font-weight: 700;
}

.checks details {
  margin-top: 0.55rem;
  color: #91a4bd;
}

.checks summary {
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 650;
}

.check-warning,
.check-error {
  color: #f3bd72;
}

@media (max-width: 760px) {
  .summary,
  .setup-grid,
  .connectivity-grid {
    grid-template-columns: 1fr;
  }

  .compact-session-row {
    grid-template-columns: 1fr;
    gap: 0.55rem;
  }

  .compact-meta {
    grid-template-columns: repeat(2, minmax(0, max-content));
    justify-content: start;
    justify-items: start;
  }

  .section-heading {
    grid-template-columns: 1fr;
    align-items: start;
  }

  header {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .header-actions {
    justify-content: space-between;
  }
}
`;

const DASHBOARD_JS = `const byId = (id) => document.getElementById(id);

const LOCALE_STORAGE_KEY = "crewlight.dashboard.locale";
const MESSAGES = {
  en: {
    "page.title": "Crewlight Live View",
    "language.label": "Language",
    "language.english": "Use English",
    "language.chinese": "使用中文",
    "header.eyebrow": "Local agent activity",
    "action.refresh": "Refresh",
    "nav.label": "Views",
    "nav.overview": "Overview",
    "nav.compact": "Compact",
    "summary.label": "Crewlight summary",
    "summary.service": "Crewlight",
    "summary.notifications": "Notifications",
    "summary.tasks": "Tasks",
    "summary.details": "Details",
    "summary.taskNames": "Task names",
    "summary.localAddress": "Local address",
    "summary.updates": "Updates",
    "common.loading": "Loading…",
    "focus.eyebrow": "Focus mode",
    "focus.heading": "Focused task",
    "focus.backOverview": "Back to overview",
    "focus.backCompact": "Back to compact",
    "focus.notFound": "Task not found",
    "focus.notActive": "This task is no longer active.",
    "focus.open": "Focus on this task",
    "empty.eyebrow": "Ready for activity",
    "empty.heading": "No activity yet",
    "empty.description": "Crewlight is ready. Connect an agent to see its current status here.",
    "empty.action": "Review setup options",
    "actionSection.eyebrow": "Needs you",
    "actionSection.heading": "Action needed",
    "actionSection.one": "{count} task",
    "actionSection.other": "{count} tasks",
    "overview.eyebrow": "Overview",
    "overview.heading": "Task status",
    "compact.eyebrow": "Compact view",
    "compact.heading": "Task status",
    "setup.heading": "Manual setup",
    "setup.check": "Test connection",
    "setup.codexStatus": "Codex status",
    "setup.codexPermissions": "Codex permission reminders",
    "setup.cursorDescription": "Cursor currently uses manual status updates from its terminal or user-defined tasks.",
    "setup.openCodeDescription": "After installing the plugin, run an OpenCode task and watch for activity here.",
    "setup.otherTools": "Other tools",
    "setup.otherDescription": "Advanced manual example. This is not a supported one-click connection.",
    "connections.heading": "Connection status",
    "connections.none": "No activity yet",
    "connections.lastUpdate": "Last update {duration} ago",
    "doctor.heading": "Troubleshooting",
    "doctor.readySummary": "Everything Crewlight needs is ready.",
    "doctor.attentionSummary": "Some items need attention.",
    "doctor.technicalDetails": "Technical details",
    "doctor.suggestedAction": "Suggested action: {action}",
    "doctor.defaultCheck": "Crewlight check",
    "doctor.status.ready": "Ready",
    "doctor.status.notNeeded": "Not needed",
    "doctor.status.review": "Review recommended",
    "doctor.status.attention": "Needs attention",
    "doctor.check.node": "App engine",
    "doctor.check.pnpm": "Build tools",
    "doctor.check.cliBuild": "Crewlight files",
    "doctor.check.startup": "Crewlight startup",
    "doctor.check.localAddress": "Local address",
    "doctor.check.connectionPort": "Connection port",
    "doctor.check.command": "Crewlight command",
    "doctor.check.liveStatus": "Live status",
    "doctor.check.taskNames": "Task names",
    "doctor.check.claudeSetup": "Claude Code setup",
    "doctor.check.codexSetup": "Codex setup",
    "doctor.check.codexPermissions": "Codex permission reminders",
    "doctor.check.notifications": "Notifications",
    "status.idle": "Idle",
    "status.running": "Running",
    "status.usingTool": "Using tool",
    "status.waitingInput": "Waiting for input",
    "status.waitingPermission": "Waiting for permission",
    "status.completed": "Completed",
    "status.failed": "Failed",
    "status.rateLimited": "Usage limit reached",
    "status.unknown": "Status unclear",
    "attention.permission": "Permission needed",
    "attention.input": "Input needed",
    "attention.review": "Needs review",
    "attention.complete": "Complete",
    "attention.check": "Check activity",
    "attention.background": "Background",
    "session.currentUnavailable": "Current activity unavailable",
    "session.unknownDetail": "Crewlight could not determine a more specific status.",
    "session.stuck": "Possibly stuck · no update for {duration}",
    "session.duration": "Duration",
    "session.lastSeen": "Last seen",
    "session.durationValue": "Duration {duration}",
    "session.lastSeenAgo": "Last seen {duration} ago",
    "workspace.unknown": "Unknown workspace",
    "source.other": "Other tool",
    "health.ready": "Ready",
    "health.attention": "Needs attention",
    "uptime": "Up for {duration} · started {date}",
    "notifier.system": "System notifications",
    "notifier.terminal": "Terminal messages",
    "notifier.off": "Off",
    "capability.enabled": "Enabled",
    "capability.disabled": "Disabled",
    "capability.polling": "Every 2 seconds",
    "request.refreshing": "Refreshing…",
    "request.updated": "Updated {time}",
    "request.unavailable": "Live status is unavailable. Restart Crewlight and try again.",
    "activity.sessionStarted": "Task started",
    "activity.requestSubmitted": "Request submitted",
    "activity.usingTool": "Using tool",
    "activity.toolCompleted": "Tool completed",
    "activity.permissionRequested": "Permission requested",
    "activity.attentionRequested": "Attention requested",
    "activity.sessionCompleted": "Task completed",
    "activity.sessionFailed": "Task failed",
    "activity.turnCompleted": "Step completed",
    "activity.sessionUpdated": "Task updated",
    "activity.statusUpdated": "Status updated",
    "activity.permissionAnswered": "Permission answered",
    "activity.activityUpdated": "Activity updated",
    "activity.commandRunning": "Task in progress",
    "activity.commandCompleted": "Task completed",
    "activity.commandFailed": "Task failed",
    "activity.idle": "Idle",
    "activity.running": "Running",
    "activity.inputRequested": "Input requested",
    "activity.rateLimited": "Usage limit reached",
    "activity.statusUnknown": "Status unclear",
    "activity.demoTests": "[Demo] Running tests",
    "activity.demoPermission": "[Demo] Permission to edit README",
    "activity.demoReview": "[Demo] Review requested",
    "activity.demoComplete": "[Demo] Check completed",
    "activity.demoFailed": "[Demo] Local setup failed",
    "activity.demoStale": "[Demo] Background task last updated",
  },
  zh: {
    "page.title": "Crewlight 实时状态",
    "language.label": "语言",
    "language.english": "Use English",
    "language.chinese": "使用中文",
    "header.eyebrow": "本机智能体动态",
    "action.refresh": "刷新",
    "nav.label": "视图",
    "nav.overview": "总览",
    "nav.compact": "紧凑",
    "summary.label": "Crewlight 概览",
    "summary.service": "Crewlight",
    "summary.notifications": "通知",
    "summary.tasks": "任务",
    "summary.details": "状态信息",
    "summary.taskNames": "任务名称",
    "summary.localAddress": "本机地址",
    "summary.updates": "更新频率",
    "common.loading": "加载中…",
    "focus.eyebrow": "专注视图",
    "focus.heading": "当前任务",
    "focus.backOverview": "返回总览",
    "focus.backCompact": "返回紧凑视图",
    "focus.notFound": "未找到任务",
    "focus.notActive": "这个任务已不在运行中。",
    "focus.open": "查看此任务",
    "empty.eyebrow": "等待任务",
    "empty.heading": "暂无动态",
    "empty.description": "Crewlight 已准备好。接入智能体后，这里会显示它的当前状态。",
    "empty.action": "查看接入方式",
    "actionSection.eyebrow": "需要你",
    "actionSection.heading": "待你处理",
    "actionSection.one": "{count} 个任务",
    "actionSection.other": "{count} 个任务",
    "overview.eyebrow": "总览",
    "overview.heading": "任务状态",
    "compact.eyebrow": "紧凑视图",
    "compact.heading": "任务状态",
    "setup.heading": "手动接入",
    "setup.check": "测试连接",
    "setup.codexStatus": "Codex 状态",
    "setup.codexPermissions": "Codex 授权提醒",
    "setup.cursorDescription": "Cursor 目前可通过终端或自定义任务手动更新状态。",
    "setup.openCodeDescription": "安装插件后，运行一个 OpenCode 任务并在这里查看动态。",
    "setup.otherTools": "其他工具",
    "setup.otherDescription": "高级手动示例，暂不支持一键接入。",
    "connections.heading": "连接状态",
    "connections.none": "暂无动态",
    "connections.lastUpdate": "距上次更新 {duration}",
    "doctor.heading": "故障排查",
    "doctor.readySummary": "Crewlight 所需项目均已就绪。",
    "doctor.attentionSummary": "有些项目需要处理。",
    "doctor.technicalDetails": "技术详情",
    "doctor.suggestedAction": "建议操作：{action}",
    "doctor.defaultCheck": "Crewlight 检查",
    "doctor.status.ready": "就绪",
    "doctor.status.notNeeded": "无需处理",
    "doctor.status.review": "建议检查",
    "doctor.status.attention": "需要处理",
    "doctor.check.node": "应用运行环境",
    "doctor.check.pnpm": "构建工具",
    "doctor.check.cliBuild": "Crewlight 文件",
    "doctor.check.startup": "Crewlight 启动",
    "doctor.check.localAddress": "本机地址",
    "doctor.check.connectionPort": "连接端口",
    "doctor.check.command": "Crewlight 命令",
    "doctor.check.liveStatus": "实时状态",
    "doctor.check.taskNames": "任务名称",
    "doctor.check.claudeSetup": "Claude Code 接入",
    "doctor.check.codexSetup": "Codex 接入",
    "doctor.check.codexPermissions": "Codex 授权提醒",
    "doctor.check.notifications": "通知",
    "status.idle": "空闲",
    "status.running": "运行中",
    "status.usingTool": "正在使用工具",
    "status.waitingInput": "等待输入",
    "status.waitingPermission": "等待授权",
    "status.completed": "已完成",
    "status.failed": "失败",
    "status.rateLimited": "已达使用限制",
    "status.unknown": "状态不明确",
    "attention.permission": "需要授权",
    "attention.input": "需要输入",
    "attention.review": "需要检查",
    "attention.complete": "已完成",
    "attention.check": "请检查动态",
    "attention.background": "后台运行",
    "session.currentUnavailable": "暂无活动信息",
    "session.unknownDetail": "Crewlight 暂时无法判断更具体的状态。",
    "session.stuck": "可能已停滞 · {duration} 未更新",
    "session.duration": "运行时长",
    "session.lastSeen": "最后出现",
    "session.durationValue": "已运行 {duration}",
    "session.lastSeenAgo": "距上次更新 {duration}",
    "workspace.unknown": "未知工作区",
    "source.other": "其他工具",
    "health.ready": "就绪",
    "health.attention": "需要处理",
    "uptime": "已运行 {duration} · 启动于 {date}",
    "notifier.system": "系统通知",
    "notifier.terminal": "终端提示",
    "notifier.off": "已关闭",
    "capability.enabled": "已开启",
    "capability.disabled": "已关闭",
    "capability.polling": "每 2 秒",
    "request.refreshing": "正在刷新…",
    "request.updated": "更新于 {time}",
    "request.unavailable": "实时状态暂不可用。请重启 Crewlight 后重试。",
    "activity.sessionStarted": "任务已开始",
    "activity.requestSubmitted": "请求已提交",
    "activity.usingTool": "正在使用工具",
    "activity.toolCompleted": "工具使用完成",
    "activity.permissionRequested": "需要授权",
    "activity.attentionRequested": "需要你处理",
    "activity.sessionCompleted": "任务已完成",
    "activity.sessionFailed": "任务失败",
    "activity.turnCompleted": "步骤已完成",
    "activity.sessionUpdated": "任务已更新",
    "activity.statusUpdated": "状态已更新",
    "activity.permissionAnswered": "授权已处理",
    "activity.activityUpdated": "动态已更新",
    "activity.commandRunning": "任务进行中",
    "activity.commandCompleted": "任务已完成",
    "activity.commandFailed": "任务失败",
    "activity.idle": "空闲",
    "activity.running": "运行中",
    "activity.inputRequested": "需要输入",
    "activity.rateLimited": "已达使用限制",
    "activity.statusUnknown": "状态不明确",
    "activity.demoTests": "[演示] 正在运行测试",
    "activity.demoPermission": "[演示] 需要授权编辑 README",
    "activity.demoReview": "[演示] 等待检查",
    "activity.demoComplete": "[演示] 检查已完成",
    "activity.demoFailed": "[演示] 本机设置失败",
    "activity.demoStale": "[演示] 后台任务最后一次更新",
  },
};

const ACTIVITY_MESSAGE_KEYS = {
  "Session started": "activity.sessionStarted",
  "Request submitted": "activity.requestSubmitted",
  "Using tool": "activity.usingTool",
  "Tool completed": "activity.toolCompleted",
  "Permission requested": "activity.permissionRequested",
  "Attention requested": "activity.attentionRequested",
  "Session completed": "activity.sessionCompleted",
  "Session failed": "activity.sessionFailed",
  "Turn completed": "activity.turnCompleted",
  "Session updated": "activity.sessionUpdated",
  "Status updated": "activity.statusUpdated",
  "Permission answered": "activity.permissionAnswered",
  "Activity updated": "activity.activityUpdated",
  "Command running": "activity.commandRunning",
  "Command completed": "activity.commandCompleted",
  "Command failed": "activity.commandFailed",
  Idle: "activity.idle",
  Running: "activity.running",
  "Input requested": "activity.inputRequested",
  "Rate limited": "activity.rateLimited",
  "Status unknown": "activity.statusUnknown",
  "[Demo] Running tests": "activity.demoTests",
  "[Demo] Permission to edit README": "activity.demoPermission",
  "[Demo] Companion review requested": "activity.demoReview",
  "[Demo] Adapter smoke completed": "activity.demoComplete",
  "[Demo] Local setup failed": "activity.demoFailed",
  "[Demo] Background scan last reported": "activity.demoStale",
};

const DOCTOR_CHECK_KEYS = {
  node: "doctor.check.node",
  pnpm: "doctor.check.pnpm",
  "cli-build": "doctor.check.cliBuild",
  daemon: "doctor.check.startup",
  "daemon-host": "doctor.check.localAddress",
  "daemon-port": "doctor.check.connectionPort",
  "cli-resolution": "doctor.check.command",
  "capabilities-endpoint": "doctor.check.liveStatus",
  "task-titles": "doctor.check.taskNames",
  "setup-claude-code": "doctor.check.claudeSetup",
  "setup-codex": "doctor.check.codexSetup",
  "setup-codex-hooks": "doctor.check.codexPermissions",
  notifier: "doctor.check.notifications",
};

function browserLocale() {
  return (navigator.language || "en").toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}

function storedLocale() {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored === "en" || stored === "zh" ? stored : undefined;
  } catch {
    return undefined;
  }
}

let currentLocale = storedLocale() || browserLocale();
let latestData;
let latestCapabilities;
let capabilitiesResolved = false;
let requestStatus;

function localeTag() {
  return currentLocale === "zh" ? "zh-CN" : "en";
}

function t(key, values = {}) {
  const template =
    MESSAGES[currentLocale][key] || MESSAGES.en[key] || String(key);
  return Object.entries(values).reduce(
    (message, [name, value]) =>
      message.split("{" + name + "}").join(String(value)),
    template,
  );
}

function setText(id, value) {
  const target = byId(id);
  if (target) {
    target.textContent = value;
  }
}

function setHidden(id, hidden) {
  const target = byId(id);
  if (target) {
    target.hidden = hidden;
  }
}

function formatDate(value) {
  return typeof value === "number"
    ? new Date(value).toLocaleString(localeTag())
    : "—";
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(value / 1000));
  if (currentLocale === "zh") {
    if (seconds < 60) return seconds + " 秒";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + " 分 " + (seconds % 60) + " 秒";
    const hours = Math.floor(minutes / 60);
    return hours + " 小时 " + (minutes % 60) + " 分";
  }
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m " + (seconds % 60) + "s";
  const hours = Math.floor(minutes / 60);
  return hours + "h " + (minutes % 60) + "m";
}

function renderRequestStatus() {
  if (!requestStatus) return;
  const values = { ...requestStatus.values };
  if (typeof values.time === "number") {
    values.time = new Date(values.time).toLocaleTimeString(localeTag());
  }
  setText("request-status", t(requestStatus.key, values));
}

function setRequestStatus(key, values = {}) {
  requestStatus = { key, values };
  renderRequestStatus();
}

function applyLocale() {
  document.documentElement.lang = localeTag();
  document.title = t("page.title");
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
  const englishButton = byId("locale-en");
  const chineseButton = byId("locale-zh");
  englishButton?.setAttribute(
    "aria-pressed",
    String(currentLocale === "en"),
  );
  englishButton?.setAttribute("aria-label", t("language.english"));
  chineseButton?.setAttribute(
    "aria-pressed",
    String(currentLocale === "zh"),
  );
  chineseButton?.setAttribute("aria-label", t("language.chinese"));
  if (capabilitiesResolved) renderCapabilities(latestCapabilities);
  if (latestData) render(latestData);
  renderRequestStatus();
}

function selectLocale(locale) {
  if (locale !== "en" && locale !== "zh") return;
  currentLocale = locale;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {}
  applyLocale();
}

const params = new URLSearchParams(window.location.search);
const focusKey = params.get("focus");
const view = params.get("view");

function statusLabel(status) {
  const labels = {
    idle: "status.idle",
    running: "status.running",
    using_tool: "status.usingTool",
    waiting_input: "status.waitingInput",
    waiting_permission: "status.waitingPermission",
    completed: "status.completed",
    failed: "status.failed",
    rate_limited: "status.rateLimited",
    unknown: "status.unknown",
  };
  return t(labels[status] || "status.unknown");
}

function attentionLabel(session) {
  if (session.attention === "action") {
    return t(
      session.actionKind === "permission"
        ? "attention.permission"
        : "attention.input",
    );
  }
  if (session.attention === "error") return t("attention.review");
  if (session.attention === "done") return t("attention.complete");
  return t(session.isStale ? "attention.check" : "attention.background");
}

function activityLabel(value) {
  const key = value ? ACTIVITY_MESSAGE_KEYS[value] : undefined;
  return key ? t(key) : value || t("session.currentUnavailable");
}

function workspaceLabel(value) {
  return value === "Unknown workspace" ? t("workspace.unknown") : value;
}

function displayName(session) {
  return session.source === "generic-cli" || session.source === "custom"
    ? t("source.other")
    : session.displayName;
}

function setActiveView(activeView) {
  const overviewLink = byId("overview-link");
  const compactLink = byId("compact-link");
  for (const [link, linkView] of [
    [overviewLink, "overview"],
    [compactLink, "compact"],
  ]) {
    if (!link) continue;
    if (linkView === activeView) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function createSessionCard(session, expanded = false) {
  const card = document.createElement("article");
  card.className =
    "session-card attention-" +
    session.attention +
    " status-" +
    session.status +
    (session.isStale ? " is-stale" : "") +
    (expanded ? " expanded" : "");

  const heading = document.createElement("div");
  heading.className = "card-heading";
  const identity = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = displayName(session);
  identity.append(name);
  if (session.taskTitle) {
    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = session.taskTitle;
    identity.append(title);
  }
  const workspace = document.createElement("p");
  workspace.className = "muted";
  workspace.textContent = workspaceLabel(session.identityLine);
  identity.append(workspace);
  const status = document.createElement("span");
  status.className = "status-badge";
  status.textContent = statusLabel(session.status);
  heading.append(identity, status);

  const activity = document.createElement("p");
  activity.className = "activity-label";
  activity.textContent = activityLabel(session.activityLabel);
  card.append(heading, activity);

  if (session.status === "unknown") {
    const confidence = document.createElement("p");
    confidence.className = "confidence-note";
    confidence.textContent = t("session.unknownDetail");
    card.append(confidence);
  }

  if (session.isStale) {
    const stale = document.createElement("p");
    stale.className = "stale-note";
    stale.textContent = t("session.stuck", {
      duration: formatDuration(session.lastEventAgeMs),
    });
    card.append(stale);
  }

  const metadata = document.createElement("dl");
  metadata.className = "card-meta";
  const values = [
    [t("session.duration"), formatDuration(session.durationMs)],
    [t("session.lastSeen"), formatDate(session.lastEventAt)],
  ];
  for (const [label, value] of values) {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    group.append(term, description);
    metadata.append(group);
  }
  card.append(metadata);

  if (!expanded) {
    const focus = document.createElement("a");
    focus.className = "focus-link";
    focus.href = "/dashboard?focus=" + encodeURIComponent(session.sessionKey);
    focus.textContent = t("focus.open");
    card.append(focus);
  }

  return card;
}

function compactRank(session) {
  if (session.attention === "action") return 0;
  if (session.attention === "error") return 1;
  if (session.isStale) return 2;
  if (session.attention === "passive") return 3;
  return 4;
}

function createCompactSessionRow(session) {
  const row = document.createElement("a");
  row.className =
    "compact-session-row attention-" +
    session.attention +
    " status-" +
    session.status +
    (session.isStale ? " is-stale" : "");
  row.href =
    "/dashboard?focus=" +
    encodeURIComponent(session.sessionKey) +
    "&view=compact";

  const primary = document.createElement("div");
  primary.className = "compact-primary";
  const heading = document.createElement("div");
  heading.className = "compact-heading";
  const status = document.createElement("span");
  status.className = "status-badge";
  status.textContent = statusLabel(session.status);
  const name = document.createElement("h3");
  name.textContent = session.taskTitle
    ? displayName(session) + " · " + session.taskTitle
    : displayName(session);
  heading.append(status, name);
  const identity = document.createElement("p");
  identity.className = "compact-identity";
  identity.textContent = workspaceLabel(session.identityLine);
  const attention = document.createElement("span");
  attention.className = "compact-attention";
  attention.textContent = attentionLabel(session);
  primary.append(heading, identity, attention);

  const activity = document.createElement("p");
  activity.className = "compact-activity";
  activity.textContent = activityLabel(session.activityLabel);

  const metadata = document.createElement("div");
  metadata.className = "compact-meta";
  const duration = document.createElement("p");
  duration.textContent = t("session.durationValue", {
    duration: formatDuration(session.durationMs),
  });
  const lastSeen = document.createElement("p");
  lastSeen.textContent = t("session.lastSeenAgo", {
    duration: formatDuration(session.lastEventAgeMs),
  });
  metadata.append(duration, lastSeen);
  if (session.isStale) {
    const stale = document.createElement("p");
    stale.className = "compact-stale";
    stale.textContent = t("attention.check");
    metadata.append(stale);
  }

  row.append(primary, activity, metadata);
  return row;
}

function renderOverview(sessions) {
  setActiveView("overview");
  setHidden("focus-root", true);
  setHidden("compact-root", true);
  setHidden("overview-root", false);
  setHidden("empty-state", sessions.length !== 0);
  setHidden("overview-section", sessions.length === 0);

  const overview = byId("sessions");
  if (overview) {
    overview.replaceChildren(
      ...sessions.map((session) => createSessionCard(session)),
    );
  }

  const actionSessions = sessions
    .filter(
      (session) =>
        session.attention === "action" || session.attention === "error",
    )
    .sort((left, right) => {
      const rank = { action: 0, error: 1 };
      const attentionDifference =
        rank[left.attention] - rank[right.attention];
      return attentionDifference || right.lastEventAt - left.lastEventAt;
    });

  setHidden("action-section", actionSessions.length === 0);
  setText(
    "action-count",
    t(
      actionSessions.length === 1
        ? "actionSection.one"
        : "actionSection.other",
      { count: actionSessions.length },
    ),
  );
  const actionNeeded = byId("action-needed");
  if (actionNeeded) {
    actionNeeded.replaceChildren(
      ...actionSessions.map((session) => createSessionCard(session)),
    );
  }
}

function renderCompact(sessions) {
  setActiveView("compact");
  setHidden("focus-root", true);
  setHidden("overview-root", true);
  setHidden("compact-root", false);
  setHidden("compact-empty-state", sessions.length !== 0);

  const compactList = byId("compact-session-list");
  if (!compactList) return;
  const compactSessions = [...sessions].sort((left, right) => {
    const rankDifference = compactRank(left) - compactRank(right);
    return rankDifference || right.lastEventAt - left.lastEventAt;
  });
  compactList.replaceChildren(
    ...compactSessions.map((session) => createCompactSessionRow(session)),
  );
}

function renderFocus(sessions, selectedFocusKey) {
  const returnToCompact = view === "compact";
  setActiveView(returnToCompact ? "compact" : "overview");
  setHidden("overview-root", true);
  setHidden("compact-root", true);
  setHidden("focus-root", false);
  const returnLink = byId("focus-return");
  if (returnLink) {
    returnLink.href = returnToCompact ? "/dashboard?view=compact" : "/dashboard";
    returnLink.textContent = t(
      returnToCompact ? "focus.backCompact" : "focus.backOverview",
    );
  }

  const target = byId("focused-session");
  if (!target) return;

  const session = sessions.find(
    (candidate) => candidate.sessionKey === selectedFocusKey,
  );
  if (session) {
    target.replaceChildren(createSessionCard(session, true));
    return;
  }

  const missing = document.createElement("article");
  missing.className = "empty-state";
  const title = document.createElement("h3");
  title.textContent = t("focus.notFound");
  const message = document.createElement("p");
  message.textContent = t("focus.notActive");
  missing.append(title, message);
  target.replaceChildren(missing);
}

function doctorCheckLabel(id) {
  return t(DOCTOR_CHECK_KEYS[id] || "doctor.defaultCheck");
}

function doctorStatusLabel(status) {
  if (status === "ok") return t("doctor.status.ready");
  if (status === "skipped") return t("doctor.status.notNeeded");
  if (status === "warning") return t("doctor.status.review");
  return t("doctor.status.attention");
}

function renderDoctor(doctor) {
  setText(
    "doctor-summary",
    t(doctor.ok ? "doctor.readySummary" : "doctor.attentionSummary"),
  );
  const list = byId("doctor-checks");
  if (!list) return;

  const items = doctor.checks.map((check) => {
    const item = document.createElement("li");
    const status = document.createElement("span");
    status.className = "check-status check-" + check.status;
    status.textContent = doctorStatusLabel(check.status);
    const message = document.createElement("span");
    message.textContent = doctorCheckLabel(check.id);
    item.append(status, message);

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = t("doctor.technicalDetails");
    const technicalMessage = document.createElement("p");
    technicalMessage.className = "muted";
    technicalMessage.textContent = check.message;
    details.append(summary, technicalMessage);
    if (check.action) {
      const action = document.createElement("p");
      action.className = "muted";
      action.textContent = t("doctor.suggestedAction", {
        action: check.action,
      });
      details.append(action);
    }
    item.append(details);
    return item;
  });
  list.replaceChildren(...items);
}

function render(data) {
  latestData = data;
  setText(
    "health",
    t(data.health.status === "ok" ? "health.ready" : "health.attention"),
  );
  setText(
    "uptime",
    t("uptime", {
      duration: formatDuration(data.health.uptimeMs),
      date: formatDate(data.health.startedAt),
    }),
  );
  setText(
    "notifier",
    t(
      data.notifier === "os"
        ? "notifier.system"
        : data.notifier === "console"
          ? "notifier.terminal"
          : "notifier.off",
    ),
  );
  setText("session-count", String(data.sessions.length));
  setText("setup-claude", data.setup.claudeCode);
  setText("setup-codex", data.setup.codex);
  setText("setup-codex-hooks", data.setup.codexHooks);
  setText("setup-cursor", data.setup.cursor);
  setText("setup-opencode", data.setup.openCode);
  setText("setup-antigravity-probe", data.setup.antigravityProbe);
  if (data.setup.verification) {
    setText("verify-claude", data.setup.verification.claudeCode);
    setText("verify-codex", data.setup.verification.codex);
    setText("verify-cursor", data.setup.verification.cursor);
    setText("verify-antigravity", data.setup.verification.antigravityProbe);
  }
  if (focusKey) {
    renderFocus(data.sessions, focusKey);
  } else if (view === "compact") {
    renderCompact(data.sessions);
  } else {
    renderOverview(data.sessions);
  }
  renderConnectivity(data.sessions);
  renderDoctor(data.doctor);
}

function renderConnectivity(sessions) {
  const getAge = (source) => {
    const session = sessions
      .filter((candidate) => candidate.source === source)
      .sort((left, right) => left.lastEventAgeMs - right.lastEventAgeMs)[0];
    if (!session) return t("connections.none");
    return t("connections.lastUpdate", {
      duration: formatDuration(session.lastEventAgeMs),
    });
  };
  setText("conn-claude", getAge("claude-code"));
  setText("conn-codex", getAge("codex"));
  setText("conn-cursor", getAge("cursor"));
  setText("conn-opencode", getAge("opencode"));
  setText("conn-antigravity", getAge("antigravity"));
}

function renderCapabilities(capabilities) {
  capabilitiesResolved = true;
  latestCapabilities = capabilities;
  setText(
    "cap-task-titles",
    capabilities
      ? t(
          capabilities.taskTitleMode === "off"
            ? "capability.disabled"
            : "capability.enabled",
        )
      : t("common.loading"),
  );
  setText("cap-endpoint", window.location.host);
  setText("cap-polling", t("capability.polling"));
}

async function fetchCapabilities() {
  let capabilities;
  try {
    const response = await fetch("/dashboard/capabilities");
    if (response.ok) {
      capabilities = await response.json();
    }
  } catch {}
  renderCapabilities(capabilities);
}

async function refresh() {
  setRequestStatus("request.refreshing");
  try {
    const response = await fetch("/dashboard/api", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to refresh");
    }
    render(await response.json());
    setRequestStatus("request.updated", { time: Date.now() });
  } catch {
    setRequestStatus("request.unavailable");
  }
}

for (const button of document.querySelectorAll("[data-locale]")) {
  button.addEventListener("click", () => selectLocale(button.dataset.locale));
}
byId("refresh")?.addEventListener("click", refresh);
applyLocale();
void fetchCapabilities();
void refresh();
window.setInterval(refresh, 2000);
`;

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function sendDashboardContent(
  response: ServerResponse,
  contentType: string,
  body: string,
  includeCsp = false,
): void {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentType,
    ...(includeCsp
      ? { "content-security-policy": CONTENT_SECURITY_POLICY }
      : {}),
  });
  response.end(body);
}

function sendDashboardJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

export function serializeDashboardSession(
  session: AgentSession,
  now: number,
): DashboardSession {
  const attention = getDashboardAttention(session.status);
  const taskTitle = getDashboardTaskTitle(session);
  const activityLabel = getDashboardActivityLabel(session);
  const shortSessionKey = getShortSessionKey(session.sessionKey);
  const lastEventAgeMs = getLastEventAgeMs(session.lastEventAt, now);
  const staleState = getDashboardStaleState(session.status, lastEventAgeMs);

  return {
    sessionKey: session.sessionKey,
    shortSessionKey,
    source: session.source,
    surface: session.surface,
    status: session.status,
    lastEventAt: session.lastEventAt,
    lastEventAgeMs,
    ...staleState,
    displayName: getDisplayName(session.source),
    displayWorkspace: getDisplayWorkspace(session),
    identityLine: getDashboardIdentityLine(session),
    ...(taskTitle ? { taskTitle } : {}),
    ...(activityLabel ? { activityLabel } : {}),
    durationMs: getDashboardDurationMs(session, now),
    ...attention,
    ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    ...(session.projectPath ? { projectPath: session.projectPath } : {}),
    ...(session.workspaceName ? { workspaceName: session.workspaceName } : {}),
    ...(session.startedAt !== undefined
      ? { startedAt: session.startedAt }
      : {}),
    ...(session.completedAt !== undefined
      ? { completedAt: session.completedAt }
      : {}),
    ...(session.lastMessage ? { lastMessage: session.lastMessage } : {}),
    ...(session.error ? { error: session.error } : {}),
    ...(session.remoteAlias ? { remoteAlias: session.remoteAlias } : {}),
  };
}

async function doctorReport(
  options: DashboardOptions,
): Promise<DashboardDoctorReport> {
  try {
    return await options.doctor();
  } catch {
    return {
      ok: false,
      checks: [
        {
          id: "dashboard-doctor",
          status: "error",
          message: "Doctor checks could not be generated.",
          action: "Run `crewlight doctor` in a terminal.",
        },
      ],
    };
  }
}

export async function handleDashboardRequest(
  pathname: string,
  response: ServerResponse,
  service: CrewlightService,
  options: DashboardOptions,
  startedAt: number,
): Promise<boolean> {
  if (pathname === "/dashboard") {
    sendDashboardContent(
      response,
      "text/html; charset=utf-8",
      DASHBOARD_HTML,
      true,
    );
    return true;
  }

  if (pathname === "/dashboard/styles.css") {
    sendDashboardContent(response, "text/css; charset=utf-8", DASHBOARD_CSS);
    return true;
  }

  if (pathname === "/dashboard/app.js") {
    sendDashboardContent(
      response,
      "text/javascript; charset=utf-8",
      DASHBOARD_JS,
    );
    return true;
  }

  if (pathname === "/dashboard/capabilities") {
    const body: DashboardCapabilities = {
      taskTitleMode: options.taskTitleMode,
    };
    sendDashboardJson(response, body);
    return true;
  }

  if (pathname === "/dashboard/api") {
    const now = Date.now();
    const body: DashboardApiResponse = {
      health: {
        status: "ok",
        startedAt,
        uptimeMs: Math.max(0, now - startedAt),
      },
      notifier: options.notifier,
      sessions: service
        .listSessions()
        .map((session) => serializeDashboardSession(session, now)),
      setup: options.setup,
      doctor: await doctorReport(options),
    };
    sendDashboardJson(response, body);
    return true;
  }

  return false;
}
