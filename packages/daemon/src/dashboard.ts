import type {
  AgentSession,
  AgentSource,
  AgentStatus,
  AgentSurface,
} from "@agentpulse/core";
import type { NotifierKind } from "@agentpulse/notifier";
import type { ServerResponse } from "node:http";

import type { AgentPulseService } from "./service.js";

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
  setup: {
    claudeCode: string;
    codex: string;
    codexHooks: string;
    openCode: string;
    antigravityProbe: string;
  };
  doctor(): Promise<DashboardDoctorReport>;
}

export type DashboardAttention = "passive" | "done" | "action" | "error";
export type DashboardActionKind = "input" | "permission";

export interface DashboardSession {
  sessionKey: string;
  source: AgentSource;
  surface: AgentSurface;
  status: AgentStatus;
  lastEventAt: number;
  displayName: string;
  displayWorkspace: string;
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
    openCode: string;
    antigravityProbe: string;
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
  custom: "Custom",
};

const ACTIVE_STATUSES = new Set<AgentStatus>([
  "running",
  "using_tool",
  "waiting_input",
  "waiting_permission",
]);

export function getDisplayName(source: AgentSource): string {
  return DISPLAY_NAMES[source] ?? source;
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
    <title>AgentPulse Dashboard</title>
    <link rel="stylesheet" href="/dashboard/styles.css">
  </head>
  <body>
    <main>
      <header>
        <div>
          <p class="eyebrow">Local agent activity</p>
          <h1>AgentPulse</h1>
        </div>
        <button id="refresh" type="button">Refresh</button>
      </header>
      <p id="request-status" class="request-status" aria-live="polite"></p>
      <section class="summary" aria-label="Daemon summary">
        <article>
          <h2>Daemon</h2>
          <p id="health">Loading…</p>
          <p id="uptime" class="muted"></p>
        </article>
        <article>
          <h2>Notifier</h2>
          <p id="notifier">Loading…</p>
        </article>
        <article>
          <h2>Sessions</h2>
          <p id="session-count">Loading…</p>
        </article>
      </section>
      <section id="focus-view" class="primary-view" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Focus mode</p>
            <h2>Focused agent</h2>
          </div>
          <a href="/dashboard">Back to overview</a>
        </div>
        <div id="focused-session"></div>
      </section>
      <section id="empty-state" class="empty-state primary-view" hidden>
        <p class="eyebrow">Ready for activity</p>
        <h2>No agent sessions yet</h2>
        <p>
          AgentPulse is running. Connect an agent or emit an event to make its
          current status visible here.
        </p>
        <a href="#setup">Review setup snippets</a>
      </section>
      <section id="action-section" class="primary-view" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Needs you</p>
            <h2>Action needed</h2>
          </div>
          <p id="action-count" class="section-count"></p>
        </div>
        <div id="action-needed" class="session-grid"></div>
      </section>
      <section id="overview-section" class="primary-view" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Overview mode</p>
            <h2>Agent status</h2>
          </div>
        </div>
        <div id="sessions" class="session-grid"></div>
      </section>
      <section id="setup">
        <h2>Setup snippets</h2>
        <div class="setup-grid">
          <article>
            <h3>Claude Code</h3>
            <pre id="setup-claude"></pre>
          </article>
          <article>
            <h3>Codex notify</h3>
            <pre id="setup-codex"></pre>
          </article>
          <article>
            <h3>Codex hooks</h3>
            <pre id="setup-codex-hooks"></pre>
          </article>
          <article>
            <h3>OpenCode</h3>
            <pre id="setup-opencode"></pre>
          </article>
          <article>
            <h3>Antigravity probe</h3>
            <p class="muted">
              Research-only command for manual probing. Antigravity is not a
              supported AgentPulse integration.
            </p>
            <pre id="setup-antigravity-probe"></pre>
          </article>
        </div>
      </section>
      <section>
        <h2>Doctor</h2>
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
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2.5rem 0 4rem;
}

header,
.summary,
.setup-grid,
.session-grid,
.section-heading {
  display: grid;
  gap: 1rem;
}

header {
  grid-template-columns: 1fr auto;
  align-items: center;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: clamp(2.4rem, 8vw, 5rem);
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

section {
  margin-top: 2rem;
}

.primary-view {
  margin-top: 2.5rem;
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
  padding: 1.1rem;
}

.summary article p:not(.muted) {
  margin-bottom: 0.25rem;
  font-size: 1.5rem;
  font-weight: 700;
}

.section-heading {
  grid-template-columns: 1fr auto;
  align-items: end;
  margin-bottom: 0.9rem;
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
  min-height: 15rem;
  border-color: #30465f;
  border-top-width: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.session-card.attention-action {
  border-color: #f0b35c;
  background: linear-gradient(145deg, rgb(53 38 20 / 94%), rgb(18 27 39 / 94%));
}

.session-card.attention-error {
  border-color: #ef776f;
  background: linear-gradient(145deg, rgb(55 26 29 / 94%), rgb(18 27 39 / 94%));
}

.session-card.attention-done {
  border-color: #65bd8b;
}

.session-card.status-unknown {
  border-color: #6c7685;
  border-style: dashed;
  background: rgb(24 29 37 / 88%);
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

.card-message {
  flex: 1;
  margin-bottom: 0;
  color: #d8e2ef;
  line-height: 1.5;
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

pre {
  overflow-x: auto;
  margin-bottom: 0;
  padding: 0.9rem;
  border-radius: 0.55rem;
  background: #090e15;
  white-space: pre-wrap;
  word-break: break-word;
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
  text-transform: uppercase;
}

.check-warning,
.check-error {
  color: #f3bd72;
}

@media (max-width: 760px) {
  .summary,
  .setup-grid {
    grid-template-columns: 1fr;
  }

  .section-heading {
    grid-template-columns: 1fr;
    align-items: start;
  }
}
`;

const DASHBOARD_JS = `const byId = (id) => document.getElementById(id);

function setText(id, value) {
  const target = byId(id);
  if (target) {
    target.textContent = value;
  }
}

function formatDate(value) {
  return typeof value === "number" ? new Date(value).toLocaleString() : "—";
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(value / 1000));
  if (seconds < 60) return seconds + "s";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m " + (seconds % 60) + "s";
  const hours = Math.floor(minutes / 60);
  return hours + "h " + (minutes % 60) + "m";
}

function setHidden(id, hidden) {
  const target = byId(id);
  if (target) {
    target.hidden = hidden;
  }
}

function statusLabel(status) {
  const labels = {
    idle: "Idle",
    running: "Running",
    using_tool: "Using tool",
    waiting_input: "Waiting for input",
    waiting_permission: "Waiting for permission",
    completed: "Completed",
    failed: "Failed",
    rate_limited: "Rate limited",
    unknown: "Unknown status",
  };
  return labels[status] || "Unknown status";
}

function createSessionCard(session, expanded = false) {
  const card = document.createElement("article");
  card.className =
    "session-card attention-" +
    session.attention +
    " status-" +
    session.status +
    (expanded ? " expanded" : "");

  const heading = document.createElement("div");
  heading.className = "card-heading";
  const identity = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = session.displayName;
  const workspace = document.createElement("p");
  workspace.className = "muted";
  workspace.textContent = session.displayWorkspace;
  identity.append(name, workspace);
  const status = document.createElement("span");
  status.className = "status-badge";
  status.textContent = statusLabel(session.status);
  heading.append(identity, status);

  const message = document.createElement("p");
  message.className = "card-message";
  message.textContent =
    session.error || session.lastMessage || "No additional status message.";

  card.append(heading, message);

  if (session.status === "unknown") {
    const confidence = document.createElement("p");
    confidence.className = "confidence-note";
    confidence.textContent =
      "AgentPulse could not determine a more specific status.";
    card.append(confidence);
  }

  const metadata = document.createElement("dl");
  metadata.className = "card-meta";
  const values = [
    ["Duration", formatDuration(session.durationMs)],
    ["Last update", formatDate(session.lastEventAt)],
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
    focus.href =
      "/dashboard?focus=" + encodeURIComponent(session.sessionKey);
    focus.textContent = "Focus on this agent";
    card.append(focus);
  }

  return card;
}

function renderOverview(sessions) {
  setHidden("focus-view", true);
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
    actionSessions.length +
      (actionSessions.length === 1 ? " session" : " sessions"),
  );
  const actionNeeded = byId("action-needed");
  if (actionNeeded) {
    actionNeeded.replaceChildren(
      ...actionSessions.map((session) => createSessionCard(session)),
    );
  }
}

function renderFocus(sessions, focusKey) {
  setHidden("empty-state", true);
  setHidden("action-section", true);
  setHidden("overview-section", true);
  setHidden("focus-view", false);

  const target = byId("focused-session");
  if (!target) return;

  const session = sessions.find((candidate) => candidate.sessionKey === focusKey);
  if (session) {
    target.replaceChildren(createSessionCard(session, true));
    return;
  }

  const missing = document.createElement("article");
  missing.className = "empty-state";
  const title = document.createElement("h3");
  title.textContent = "Focused session not found";
  const message = document.createElement("p");
  message.textContent =
    "This session is not present in the current daemon response.";
  missing.append(title, message);
  target.replaceChildren(missing);
}

function renderDoctor(doctor) {
  setText("doctor-summary", doctor.ok ? "All required checks passed." : "One or more required checks failed.");
  const list = byId("doctor-checks");
  if (!list) return;

  const items = doctor.checks.map((check) => {
    const item = document.createElement("li");
    const status = document.createElement("span");
    status.className = "check-status check-" + check.status;
    status.textContent = check.status;
    const message = document.createElement("span");
    message.textContent = check.id + ": " + check.message;
    item.append(status, message);
    if (check.action) {
      const action = document.createElement("p");
      action.className = "muted";
      action.textContent = "Action: " + check.action;
      item.append(action);
    }
    return item;
  });
  list.replaceChildren(...items);
}

function render(data) {
  setText("health", data.health.status);
  setText("uptime", "Up for " + formatDuration(data.health.uptimeMs) + " · started " + formatDate(data.health.startedAt));
  setText("notifier", data.notifier);
  setText("session-count", String(data.sessions.length));
  setText("setup-claude", data.setup.claudeCode);
  setText("setup-codex", data.setup.codex);
  setText("setup-codex-hooks", data.setup.codexHooks);
  setText("setup-opencode", data.setup.openCode);
  setText("setup-antigravity-probe", data.setup.antigravityProbe);
  const focusKey = new URLSearchParams(window.location.search).get("focus");
  if (focusKey) {
    renderFocus(data.sessions, focusKey);
  } else {
    renderOverview(data.sessions);
  }
  renderDoctor(data.doctor);
}

async function refresh() {
  setText("request-status", "Refreshing…");
  try {
    const response = await fetch("/dashboard/api", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
    render(await response.json());
    setText("request-status", "Updated " + new Date().toLocaleTimeString());
  } catch {
    setText("request-status", "Dashboard data is unavailable. Confirm the daemon is still running.");
  }
}

byId("refresh")?.addEventListener("click", refresh);
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

export function serializeDashboardSession(
  session: AgentSession,
  now: number,
): DashboardSession {
  const attention = getDashboardAttention(session.status);

  return {
    sessionKey: session.sessionKey,
    source: session.source,
    surface: session.surface,
    status: session.status,
    lastEventAt: session.lastEventAt,
    displayName: getDisplayName(session.source),
    displayWorkspace: getDisplayWorkspace(session),
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
          action: "Run `agentpulse doctor` in a terminal.",
        },
      ],
    };
  }
}

export async function handleDashboardRequest(
  pathname: string,
  response: ServerResponse,
  service: AgentPulseService,
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
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(body));
    return true;
  }

  return false;
}
