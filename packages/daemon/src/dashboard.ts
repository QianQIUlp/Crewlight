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
  };
  doctor(): Promise<DashboardDoctorReport>;
}

export interface DashboardSession {
  sessionKey: string;
  source: AgentSource;
  surface: AgentSurface;
  status: AgentStatus;
  lastEventAt: number;
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
  };
  doctor: DashboardDoctorReport;
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
      <section>
        <h2>Sessions</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Source</th>
                <th>Workspace</th>
                <th>Message</th>
                <th>Last event</th>
              </tr>
            </thead>
            <tbody id="sessions"></tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>Setup snippets</h2>
        <div class="setup-grid">
          <article>
            <h3>Claude Code</h3>
            <pre id="setup-claude"></pre>
          </article>
          <article>
            <h3>Codex</h3>
            <pre id="setup-codex"></pre>
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
    radial-gradient(circle at top left, #17304d 0, transparent 34rem),
    #0b1018;
}

main {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2.5rem 0 4rem;
}

header,
.summary,
.setup-grid {
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

.eyebrow,
.muted,
.request-status {
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

.summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

article,
.table-wrap,
section > .checks {
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

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #27384d;
  text-align: left;
  vertical-align: top;
}

th {
  color: #91a4bd;
  font-size: 0.8rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

tbody tr:last-child td {
  border-bottom: 0;
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

function renderSessions(sessions) {
  const body = byId("sessions");
  if (!body) return;

  if (sessions.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No sessions observed by this daemon.";
    row.append(cell);
    body.replaceChildren(row);
    return;
  }

  const rows = sessions.map((session) => {
    const row = document.createElement("tr");
    const values = [
      session.status,
      session.source,
      session.workspaceName || session.projectPath || "Unknown workspace",
      session.error || session.lastMessage || "—",
      formatDate(session.lastEventAt),
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    return row;
  });
  body.replaceChildren(...rows);
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
  renderSessions(data.sessions);
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

function serializeSession(session: AgentSession): DashboardSession {
  return {
    sessionKey: session.sessionKey,
    source: session.source,
    surface: session.surface,
    status: session.status,
    lastEventAt: session.lastEventAt,
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
      sessions: service.listSessions().map(serializeSession),
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
