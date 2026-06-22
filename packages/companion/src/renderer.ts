import type { CompanionSessionView, CompanionViewModel } from "./state.js";

let expanded = false;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing companion element: ${id}`);
  }
  return element as T;
}

function setText(id: string, value: string): void {
  byId(id).textContent = value;
}

function renderPrimaryDetail(
  session: CompanionSessionView | undefined,
  diagnostic: string | undefined,
): void {
  if (!session) {
    setText("primary-session", diagnostic ?? "No current sessions");
    return;
  }
  setText("primary-session", `${session.source} · ${session.title}`);
}

function createSessionRow(session: CompanionSessionView): HTMLElement {
  const row = document.createElement("article");
  row.className = `session-row tone-${session.tone}`;

  const header = document.createElement("div");
  header.className = "session-row-header";
  const source = document.createElement("strong");
  source.textContent = session.source;
  const status = document.createElement("span");
  status.className = "session-status";
  status.textContent = session.statusLabel;
  header.append(source, status);

  const title = document.createElement("p");
  title.className = "session-title";
  title.textContent = session.title;

  const metadata = document.createElement("p");
  metadata.className = "session-meta";
  metadata.textContent = `${session.surface} · ${session.activity} · ${session.lastEventLabel}`;

  row.append(header, title, metadata);
  if (session.diagnosticHint) {
    const diagnostic = document.createElement("p");
    diagnostic.className = "session-diagnostic";
    diagnostic.textContent = session.diagnosticHint;
    row.append(diagnostic);
  }

  return row;
}

function render(viewModel: CompanionViewModel): void {
  expanded = viewModel.expanded;
  document.body.dataset.state = viewModel.state;
  document.body.classList.toggle("expanded", expanded);
  setText("summary", viewModel.summary);
  setText("running-count", String(viewModel.counts.running));
  setText("action-count", String(viewModel.counts.action));
  setText("failed-count", String(viewModel.counts.failed));
  renderPrimaryDetail(viewModel.mostImportant, viewModel.diagnostic);

  const expandButton = byId<HTMLButtonElement>("expand");
  expandButton.textContent = expanded ? "−" : "+";
  expandButton.setAttribute("aria-label", expanded ? "Collapse" : "Expand");
  expandButton.setAttribute("aria-expanded", String(expanded));

  const alwaysOnTopButton = byId<HTMLButtonElement>("always-on-top");
  alwaysOnTopButton.setAttribute("aria-pressed", String(viewModel.alwaysOnTop));
  alwaysOnTopButton.textContent = viewModel.alwaysOnTop ? "Pinned" : "Pin";

  const diagnostic = byId("diagnostic");
  diagnostic.textContent = viewModel.diagnostic ?? "";
  diagnostic.hidden = !viewModel.diagnostic;

  const sessionList = byId("session-list");
  sessionList.replaceChildren(
    ...viewModel.sessions.map((session) => createSessionRow(session)),
  );
  byId("empty-sessions").hidden = viewModel.sessions.length !== 0;
}

byId("expand").addEventListener("click", () => {
  window.agentPulse.setExpanded(!expanded);
});
byId("hide").addEventListener("click", () => {
  window.agentPulse.hide();
});
byId("always-on-top").addEventListener("click", () => {
  window.agentPulse.toggleAlwaysOnTop();
});
byId("open-dashboard").addEventListener("click", () => {
  window.agentPulse.openDashboard();
});
byId("quit").addEventListener("click", () => {
  window.agentPulse.quit();
});

window.agentPulse.onViewModel(render);
void window.agentPulse.getViewModel().then(render);
