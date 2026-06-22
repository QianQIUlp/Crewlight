import {
  filterSessionViews,
  type CompanionSessionFilter,
  type CompanionSessionView,
  type CompanionViewModel,
} from "./state.js";

let expanded = false;
let selectedFilter: CompanionSessionFilter = "all";
let latestViewModel: CompanionViewModel | undefined;
let copyFeedbackTimer: number | undefined;

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

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function isConnectionState(viewModel: CompanionViewModel): boolean {
  return viewModel.state === "offline" || viewModel.state === "api-unavailable";
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

function createSessionCard(session: CompanionSessionView): HTMLElement {
  const card = createElement("article", `session-card tone-${session.tone}`);
  card.setAttribute(
    "aria-label",
    `${session.source}, ${session.title}, ${session.statusLabel}, ${session.lastEventLabel}`,
  );

  const topLine = createElement("div", "session-topline");
  const identity = createElement("div", "source-identity");
  identity.append(
    createElement("span", "source-dot"),
    createElement("span", "source-name", session.source),
    createElement("span", "surface-name", `· ${session.surface}`),
  );
  const status = createElement("span", "status-badge", session.statusLabel);
  topLine.append(identity, status);

  const titleLine = createElement("div", "session-titleline");
  titleLine.append(createElement("p", "session-title", session.title));
  if (session.needsAction) {
    titleLine.append(createElement("span", "attention-badge", "Needs you"));
  }

  const footer = createElement("div", "session-footer");
  footer.append(
    createElement("span", "workspace-name", session.workspace),
    createElement("span", "activity-label", session.activity),
    createElement(
      "span",
      "age-label",
      session.isStale
        ? `Stale · ${session.lastEventLabel}`
        : session.lastEventLabel,
    ),
  );

  card.append(topLine, titleLine, footer);
  if (session.diagnosticHint) {
    card.append(
      createElement("p", "session-diagnostic", session.diagnosticHint),
    );
  }

  return card;
}

function renderFilters(viewModel: CompanionViewModel): void {
  const connectionUnavailable = isConnectionState(viewModel);
  const filters = document.querySelector<HTMLElement>(".filters");
  if (!filters) {
    throw new Error("Missing companion filter controls.");
  }
  filters.hidden = connectionUnavailable;

  document
    .querySelectorAll<HTMLButtonElement>(".filter-chip")
    .forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.filter === selectedFilter),
      );
    });
}

function renderSessions(viewModel: CompanionViewModel): void {
  const connectionUnavailable = isConnectionState(viewModel);
  const filteredSessions = filterSessionViews(
    viewModel.sessions,
    selectedFilter,
  );
  const sessionList = byId("session-list");
  sessionList.hidden = connectionUnavailable;
  sessionList.replaceChildren(
    ...filteredSessions.map((session) => createSessionCard(session)),
  );

  const emptyState = byId("empty-sessions");
  const showEmpty = !connectionUnavailable && filteredSessions.length === 0;
  emptyState.hidden = !showEmpty;
  if (showEmpty && selectedFilter === "all") {
    setText("empty-title", "Watching for agents");
    setText(
      "empty-detail",
      "Sessions will appear here as supported coding agents report local activity.",
    );
  } else if (showEmpty) {
    setText("empty-title", "No matching sessions");
    setText(
      "empty-detail",
      "Current activity does not match this filter. Choose All to see every observed session.",
    );
  }
}

function renderConnectionState(viewModel: CompanionViewModel): void {
  const connectionState = byId("connection-state");
  const unavailable = isConnectionState(viewModel);
  connectionState.hidden = !unavailable;
  if (!unavailable) {
    return;
  }

  setText("connection-title", viewModel.summary);
  setText(
    "connection-detail",
    viewModel.diagnostic ??
      "Start the dashboard-enabled daemon. AgentPulse will reconnect automatically.",
  );
}

function render(viewModel: CompanionViewModel): void {
  latestViewModel = viewModel;
  expanded = viewModel.expanded;
  document.body.dataset.state = viewModel.state;
  document.body.classList.toggle("expanded", expanded);

  setText("summary", viewModel.summary);
  setText("running-count", String(viewModel.counts.running));
  setText("action-count", String(viewModel.counts.action));
  setText("failed-count", String(viewModel.counts.failed));
  setText(
    "session-total",
    `${viewModel.sessions.length} ${
      viewModel.sessions.length === 1 ? "session" : "sessions"
    }`,
  );
  renderPrimaryDetail(viewModel.mostImportant, viewModel.diagnostic);

  const expandButton = byId<HTMLButtonElement>("expand");
  expandButton.setAttribute("aria-label", expanded ? "Collapse" : "Expand");
  expandButton.setAttribute("aria-expanded", String(expanded));
  expandButton.title = expanded ? "Collapse" : "Expand";
  setText("expand-icon", expanded ? "⌃" : "⌄");

  const alwaysOnTopButton = byId<HTMLButtonElement>("always-on-top");
  alwaysOnTopButton.setAttribute("aria-pressed", String(viewModel.alwaysOnTop));
  alwaysOnTopButton.setAttribute(
    "aria-label",
    viewModel.alwaysOnTop ? "Unpin window" : "Pin window",
  );
  alwaysOnTopButton.title = viewModel.alwaysOnTop
    ? "Disable always on top"
    : "Keep always on top";

  const diagnostic = byId("diagnostic");
  diagnostic.textContent = viewModel.diagnostic ?? "";
  diagnostic.hidden = !viewModel.diagnostic || isConnectionState(viewModel);

  renderFilters(viewModel);
  renderConnectionState(viewModel);
  renderSessions(viewModel);
}

function isSessionFilter(
  value: string | undefined,
): value is CompanionSessionFilter {
  return (
    value === "all" ||
    value === "attention" ||
    value === "running" ||
    value === "done" ||
    value === "failed-stale"
  );
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
document
  .querySelectorAll<HTMLButtonElement>(".open-dashboard")
  .forEach((button) => {
    button.addEventListener("click", () => {
      window.agentPulse.openDashboard();
    });
  });
byId("quit").addEventListener("click", () => {
  window.agentPulse.quit();
});
byId("copy-command").addEventListener("click", async () => {
  const button = byId<HTMLButtonElement>("copy-command");
  if (copyFeedbackTimer !== undefined) {
    window.clearTimeout(copyFeedbackTimer);
  }
  button.textContent = (await window.agentPulse.copyDaemonCommand())
    ? "Copied"
    : "Copy failed";
  copyFeedbackTimer = window.setTimeout(() => {
    button.textContent = "Copy daemon command";
  }, 1_800);
});
document
  .querySelectorAll<HTMLButtonElement>(".filter-chip")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter;
      if (!isSessionFilter(filter)) {
        return;
      }
      selectedFilter = filter;
      if (latestViewModel) {
        render(latestViewModel);
      }
    });
  });

window.agentPulse.onViewModel(render);
void window.agentPulse.getViewModel().then(render);
