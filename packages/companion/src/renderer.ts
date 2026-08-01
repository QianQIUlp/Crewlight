import {
  filterSessionViews,
  formatCompanionDuration,
  getCompanionCopy,
  type CompanionCopy,
  type CompanionLocale,
  type CompanionSessionFilter,
  type CompanionSessionView,
  type CompanionViewModel,
} from "./state.js";
import { DisclosureState } from "./interaction.js";

let expanded = false;
let selectedFilter: CompanionSessionFilter = "all";
let latestViewModel: CompanionViewModel | undefined;
let sessionDetailId = 0;
let copyFeedbackTimer: number | undefined;
const sessionDisclosures = new DisclosureState();

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

function queryElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing companion element: ${selector}`);
  }
  return element;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
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
  copy: CompanionCopy,
): void {
  if (!session) {
    setText("primary-session", diagnostic ?? copy.noCurrentSessions);
    return;
  }
  setText("primary-session", `${session.source} · ${session.title}`);
}

function createSessionCard(
  session: CompanionSessionView,
  locale: CompanionLocale,
): HTMLElement {
  const copy = getCompanionCopy(locale);
  const card = createElement("article", `session-card tone-${session.tone}`);
  card.setAttribute(
    "aria-label",
    `${session.source}, ${session.title}, ${session.statusLabel}, ${session.lastEventLabel}`,
  );

  const topLine = createElement("div", "session-topline");
  const identity = createElement("div", "source-identity");
  const elapsedText =
    session.elapsedMs > 0
      ? ` (${formatCompanionDuration(session.elapsedMs, locale)})`
      : "";
  identity.append(
    createElement("span", "source-dot"),
    createElement("span", "source-name", session.source),
  );
  if (session.remoteAlias) {
    identity.append(
      createElement("span", "remote-badge", `🌐 ${session.remoteAlias}`),
    );
  }
  identity.append(
    createElement("span", "surface-name", `· ${session.surface}${elapsedText}`),
  );
  const status = createElement("span", "status-badge", session.statusLabel);
  topLine.append(identity, status);

  const titleLine = createElement("div", "session-titleline");
  titleLine.append(createElement("p", "session-title", session.title));
  if (session.needsAction) {
    titleLine.append(createElement("span", "attention-badge", copy.needsYou));
  }

  const footer = createElement("div", "session-footer");
  footer.append(
    createElement("span", "workspace-name", session.workspace),
    createElement("span", "activity-label", session.activity),
    createElement(
      "span",
      "age-label",
      session.isStale
        ? `${copy.stale} · ${session.lastEventLabel}`
        : session.lastEventLabel,
    ),
  );

  card.append(topLine, titleLine, footer);
  if (session.stuckWarning) {
    card.append(
      createElement(
        "p",
        "session-diagnostic stuck-warning",
        copy.possiblyStuck,
      ),
    );
  } else if (session.diagnosticHint) {
    card.append(
      createElement("p", "session-diagnostic", session.diagnosticHint),
    );
  }

  const detail = createElement("div", "session-detail");
  detail.id = `companion-session-detail-${++sessionDetailId}`;

  const addDetailLine = (label: string, val: string) => {
    const line = createElement("p", "session-detail-text");
    const strong = createElement("strong", undefined, `${label}: `);
    line.append(strong, document.createTextNode(val));
    detail.append(line);
  };

  addDetailLine(copy.workspace, session.workspace);
  addDetailLine(copy.status, session.statusLabel);
  addDetailLine(copy.activity, session.activity);
  if (session.diagnosticHint) {
    addDetailLine(copy.diagnostic, session.diagnosticHint);
  }

  const toggle = createElement(
    "button",
    "text-button session-detail-toggle",
  ) as HTMLButtonElement;
  toggle.type = "button";
  toggle.dataset.disclosureId = session.id;
  toggle.setAttribute("aria-controls", detail.id);
  const applyExpanded = (isExpanded: boolean) => {
    toggle.setAttribute("aria-expanded", String(isExpanded));
    toggle.textContent = isExpanded ? copy.hideDetails : copy.showDetails;
    toggle.setAttribute(
      "aria-label",
      copy.detailFor(isExpanded, session.title),
    );
    detail.hidden = !isExpanded;
  };
  applyExpanded(sessionDisclosures.isExpanded(session.id));
  toggle.addEventListener("click", () => {
    applyExpanded(sessionDisclosures.toggle(session.id));
  });
  card.append(toggle, detail);

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

function applyStaticLocale(locale: CompanionLocale): void {
  const copy = getCompanionCopy(locale);
  document.documentElement.lang = locale;
  document.title =
    locale === "zh-CN" ? "Crewlight 本地伴侣" : "Crewlight Companion";

  queryElement(".product-mode").textContent = copy.productMode;
  queryElement(".compact-overview .eyebrow").textContent = copy.overallState;

  const counts = queryElement(".counts");
  counts.setAttribute("aria-label", copy.sessionCounts);
  const countLabels = counts.querySelectorAll<HTMLElement>("div > span");
  const translatedCountLabels = [
    copy.runningCount,
    copy.needsActionCount,
    copy.failedCount,
  ];
  countLabels.forEach((label, index) => {
    label.textContent = translatedCountLabels[index] ?? "";
  });

  queryElement(".section-heading .eyebrow").textContent = copy.currentActivity;
  queryElement(".section-heading h2").textContent = copy.sessionRadar;

  const filters = queryElement(".filters");
  filters.setAttribute("aria-label", copy.filterSessions);
  const filterLabels: Record<CompanionSessionFilter, string> = {
    all: copy.allFilter,
    attention: copy.needsAttentionFilter,
    running: copy.runningFilter,
    done: copy.doneFilter,
    "failed-stale": copy.failedStaleFilter,
  };
  filters
    .querySelectorAll<HTMLButtonElement>(".filter-chip")
    .forEach((button) => {
      const filter = button.dataset.filter;
      if (isSessionFilter(filter)) {
        button.textContent = filterLabels[filter];
      }
    });

  queryElement("#connection-state > .eyebrow").textContent =
    copy.localConnection;
  if (copyFeedbackTimer === undefined) {
    setText("copy-command", copy.copyDaemonCommand);
  }
  document
    .querySelectorAll<HTMLButtonElement>(".open-dashboard")
    .forEach((button) => {
      button.textContent = copy.openDashboard;
      button.setAttribute("aria-label", copy.openDashboard);
    });
  setText("quit", copy.quit);
  queryElement(".panel-footer > span").textContent = copy.localOnly;

  const hideButton = byId<HTMLButtonElement>("hide");
  hideButton.setAttribute("aria-label", copy.hide);
  hideButton.title = copy.hide;
}

function renderSessions(viewModel: CompanionViewModel): void {
  const copy = getCompanionCopy(viewModel.locale);
  const connectionUnavailable = isConnectionState(viewModel);
  const filteredSessions = filterSessionViews(
    viewModel.sessions,
    selectedFilter,
  );
  const sessionList = byId("session-list");
  sessionDisclosures.retain(viewModel.sessions.map((session) => session.id));
  const activeElement = document.activeElement;
  const focusedDisclosureId =
    activeElement instanceof HTMLButtonElement &&
    sessionList.contains(activeElement)
      ? activeElement.dataset.disclosureId
      : undefined;
  sessionList.hidden = connectionUnavailable;
  sessionList.replaceChildren(
    ...filteredSessions.map((session) =>
      createSessionCard(session, viewModel.locale),
    ),
  );
  if (focusedDisclosureId) {
    const replacement = Array.from(
      sessionList.querySelectorAll<HTMLButtonElement>(
        "button[data-disclosure-id]",
      ),
    ).find((button) => button.dataset.disclosureId === focusedDisclosureId);
    replacement?.focus();
  }

  const emptyState = byId("empty-sessions");
  const showEmpty = !connectionUnavailable && filteredSessions.length === 0;
  emptyState.hidden = !showEmpty;
  if (showEmpty && selectedFilter === "all") {
    setText("empty-title", copy.emptyTitle);
    setText("empty-detail", copy.emptyDetail);
  } else if (showEmpty) {
    setText("empty-title", copy.noMatchingTitle);
    setText("empty-detail", copy.noMatchingDetail);
  }
}

function renderConnectionState(viewModel: CompanionViewModel): void {
  const copy = getCompanionCopy(viewModel.locale);
  const connectionState = byId("connection-state");
  const unavailable = isConnectionState(viewModel);
  connectionState.hidden = !unavailable;
  if (!unavailable) {
    return;
  }

  setText("connection-title", viewModel.summary);
  setText("connection-detail", viewModel.diagnostic ?? copy.startDaemon);
}

function render(viewModel: CompanionViewModel): void {
  latestViewModel = viewModel;
  const copy = getCompanionCopy(viewModel.locale);
  applyStaticLocale(viewModel.locale);
  expanded = viewModel.expanded;
  document.body.dataset.state = viewModel.state;
  document.body.classList.toggle("expanded", expanded);

  setText("summary", viewModel.summary);
  setText("running-count", String(viewModel.counts.running));
  setText("action-count", String(viewModel.counts.action));
  setText("failed-count", String(viewModel.counts.failed));
  setText("session-total", copy.sessions(viewModel.sessions.length));
  renderPrimaryDetail(viewModel.mostImportant, viewModel.diagnostic, copy);

  const expandButton = byId<HTMLButtonElement>("expand");
  expandButton.setAttribute(
    "aria-label",
    expanded ? copy.collapse : copy.expand,
  );
  expandButton.setAttribute("aria-expanded", String(expanded));
  expandButton.title = expanded ? copy.collapse : copy.expand;
  setText("expand-icon", expanded ? "⌃" : "⌄");

  const alwaysOnTopButton = byId<HTMLButtonElement>("always-on-top");
  alwaysOnTopButton.setAttribute("aria-pressed", String(viewModel.alwaysOnTop));
  alwaysOnTopButton.setAttribute(
    "aria-label",
    viewModel.alwaysOnTop ? copy.unpinWindow : copy.pinWindow,
  );
  alwaysOnTopButton.title = viewModel.alwaysOnTop
    ? copy.disableAlwaysOnTop
    : copy.keepAlwaysOnTop;

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
  window.crewlight.setExpanded(!expanded);
});
byId("hide").addEventListener("click", () => {
  window.crewlight.hide();
});
byId("always-on-top").addEventListener("click", () => {
  window.crewlight.toggleAlwaysOnTop();
});
document
  .querySelectorAll<HTMLButtonElement>(".open-dashboard")
  .forEach((button) => {
    button.addEventListener("click", () => {
      window.crewlight.openDashboard();
    });
  });
byId("quit").addEventListener("click", () => {
  window.crewlight.quit();
});
byId("copy-command").addEventListener("click", async () => {
  const button = byId<HTMLButtonElement>("copy-command");
  const locale = latestViewModel?.locale ?? "en";
  const copy = getCompanionCopy(locale);
  if (copyFeedbackTimer !== undefined) {
    window.clearTimeout(copyFeedbackTimer);
  }
  button.textContent = (await window.crewlight.copyDaemonCommand())
    ? copy.copied
    : copy.copyFailed;
  copyFeedbackTimer = window.setTimeout(() => {
    button.textContent = getCompanionCopy(
      latestViewModel?.locale ?? locale,
    ).copyDaemonCommand;
    copyFeedbackTimer = undefined;
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

window.crewlight.onViewModel(render);
void window.crewlight.getViewModel().then(render);
