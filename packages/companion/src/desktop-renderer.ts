import type {
  DesktopActionCard,
  DesktopIntegrationCard,
  DesktopOnboardingStep,
  DesktopSessionCard,
  DesktopViewModel,
} from "./desktop-state.js";
import type { PreferredIntegration } from "./desktop-preferences.js";
import { DisclosureState } from "./interaction.js";

let latestState: DesktopViewModel | undefined;
let onboardingStepIndex = 0;
let sessionDetailId = 0;
let dialogReturnFocus: HTMLElement | undefined;
const homeSessionDisclosures = new DisclosureState();
const demoSessionDisclosures = new DisclosureState();

type DesktopPanelId =
  | "home"
  | "demo"
  | "agents"
  | "doctor"
  | "settings"
  | "companion"
  | "appearance"
  | "remote"
  | "about";

interface DesktopPanelDefinition {
  group: string;
  id: DesktopPanelId;
  label: string;
  section: DesktopViewModel["selectedSection"];
  subtitle: string;
}

const DESKTOP_PANELS: readonly DesktopPanelDefinition[] = [
  {
    group: "Inbox",
    id: "home",
    label: "Attention Inbox",
    section: "home",
    subtitle:
      "See what needs you, what is active, and what is ready to review.",
  },
  {
    group: "Inbox",
    id: "demo",
    label: "Demo preview",
    section: "home",
    subtitle: "Preview Crewlight with safe, local synthetic sessions.",
  },
  {
    group: "Integrations",
    id: "agents",
    label: "Claude Code & Codex",
    section: "connect",
    subtitle: "Inspect or install the two supported local integrations.",
  },
  {
    group: "System",
    id: "doctor",
    label: "Troubleshooting",
    section: "troubleshooting",
    subtitle: "Check service health, configuration, notifications, and events.",
  },
  {
    group: "Preferences",
    id: "settings",
    label: "General",
    section: "settings",
    subtitle: "Configure the local service and Desktop behavior.",
  },
  {
    group: "Preferences",
    id: "companion",
    label: "Companion",
    section: "settings",
    subtitle: "Control the compact floating attention view.",
  },
  {
    group: "Preferences",
    id: "appearance",
    label: "Appearance",
    section: "settings",
    subtitle: "Adjust theme, density, accent, and launch visibility.",
  },
  {
    group: "Preferences",
    id: "remote",
    label: "Remote (Beta)",
    section: "settings",
    subtitle: "Manage trusted SSH-forwarded Crewlight connections.",
  },
  {
    group: "Preferences",
    id: "about",
    label: "About",
    section: "settings",
    subtitle: "Review version, product boundaries, and project information.",
  },
] as const;

const DEFAULT_PANEL_BY_SECTION: Record<
  DesktopViewModel["selectedSection"],
  DesktopPanelId
> = {
  home: "home",
  connect: "agents",
  troubleshooting: "doctor",
  settings: "settings",
};

let activePanel: DesktopPanelId = "home";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing desktop element: ${id}`);
  }
  return element as T;
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

function setText(id: string, value: string): void {
  byId(id).textContent = value;
}

function setHidden(id: string, hidden: boolean): void {
  byId(id).hidden = hidden;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function renderSessionCard(
  session: DesktopSessionCard,
  disclosures: DisclosureState,
): HTMLElement {
  const card = createElement("article", "session-card");
  card.dataset.tone = session.tone;

  const topLine = createElement("div", "session-topline");
  const elapsedText =
    session.elapsedMs > 0 ? ` (${formatDuration(session.elapsedMs)})` : "";
  const sourceChip = createElement(
    "span",
    "chip",
    `${session.source} · ${session.surface}${elapsedText}`,
  );
  if (session.remoteAlias) {
    topLine.append(
      sourceChip,
      createElement("span", "chip remote-chip", `🌐 ${session.remoteAlias}`),
      createElement("span", "chip", session.statusLabel),
    );
  } else {
    topLine.append(
      sourceChip,
      createElement("span", "chip", session.statusLabel),
    );
  }

  const title = createElement("h4", "session-title", session.title);
  const activity = createElement("p", "session-meta", session.activity);

  const footer = createElement("div", "session-footer");
  footer.append(
    createElement("span", "session-meta", session.workspace),
    createElement("span", "session-meta", session.ageLabel),
  );

  card.append(topLine, title, activity, footer);
  if (session.stuckWarning) {
    card.append(
      createElement(
        "p",
        "session-meta stuck-warning",
        "⚠️ Possibly stuck (no events for 5m)",
      ),
    );
  } else if (session.diagnosticHint) {
    card.append(createElement("p", "session-meta", session.diagnosticHint));
  }

  const detail = createElement("div", "session-detail");
  detail.id = `desktop-session-detail-${++sessionDetailId}`;

  const addDetailLine = (label: string, val: string) => {
    const line = createElement("p", "session-detail-text");
    const strong = createElement("strong", undefined, `${label}: `);
    line.append(strong, document.createTextNode(val));
    detail.append(line);
  };

  addDetailLine("Workspace", session.workspace);
  addDetailLine("Status", session.statusLabel);
  addDetailLine("Activity", session.activity);
  if (session.diagnosticHint) {
    addDetailLine("Diagnostic", session.diagnosticHint);
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
    toggle.textContent = isExpanded ? "Hide details" : "Show details";
    toggle.setAttribute(
      "aria-label",
      `${isExpanded ? "Hide" : "Show"} details for ${session.title}`,
    );
    detail.hidden = !isExpanded;
  };
  applyExpanded(disclosures.isExpanded(session.id));
  toggle.addEventListener("click", () => {
    applyExpanded(disclosures.toggle(session.id));
  });
  card.append(toggle, detail);

  return card;
}

function replaceSessionCards(
  container: HTMLElement,
  sessions: readonly DesktopSessionCard[],
  disclosures: DisclosureState,
): void {
  disclosures.retain(sessions.map((session) => session.id));
  const activeElement = document.activeElement;
  const focusedDisclosureId =
    activeElement instanceof HTMLButtonElement &&
    container.contains(activeElement)
      ? activeElement.dataset.disclosureId
      : undefined;
  container.replaceChildren(
    ...sessions.map((session) => renderSessionCard(session, disclosures)),
  );
  if (focusedDisclosureId) {
    const replacement = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "button[data-disclosure-id]",
      ),
    ).find((button) => button.dataset.disclosureId === focusedDisclosureId);
    replacement?.focus();
  }
}

function closeRemoteInstallDialog(): void {
  const modal = byId("remote-install-modal");
  if (modal.hidden) {
    return;
  }
  modal.hidden = true;
  byId("app-shell").inert = false;
  const focusTarget =
    dialogReturnFocus?.isConnected === true
      ? dialogReturnFocus
      : byId<HTMLButtonElement>("remote-rescan-btn");
  dialogReturnFocus = undefined;
  focusTarget.focus();
}

function openRemoteInstallDialog(alias: string, trigger: HTMLElement): void {
  const modal = byId("remote-install-modal");
  dialogReturnFocus = trigger;
  modal.dataset.alias = alias;
  setText("remote-install-host-name", alias);
  setText(
    "remote-install-version",
    latestState?.about.version ?? "the matching Crewlight version",
  );
  byId("app-shell").inert = true;
  modal.hidden = false;
  byId<HTMLButtonElement>("remote-install-dismiss").focus();
}

function renderSidebar(state: DesktopViewModel): void {
  const nav = byId("sidebar-nav");
  const groups = [...new Set(DESKTOP_PANELS.map((panel) => panel.group))];
  nav.replaceChildren(
    ...groups.map((groupLabel) => {
      const group = createElement("div", "nav-group");
      group.append(createElement("p", "nav-group-label", groupLabel));
      for (const panel of DESKTOP_PANELS.filter(
        (candidate) => candidate.group === groupLabel,
      )) {
        const button = createElement("button", "nav-button");
        button.type = "button";
        button.dataset.panel = panel.id;
        button.dataset.section = panel.section;
        button.disabled = state.onboarding.active;
        button.classList.toggle("active", panel.id === activePanel);
        if (panel.id === activePanel) {
          button.setAttribute("aria-current", "page");
        }
        button.append(createElement("span", undefined, panel.label));
        if (panel.id === "home" && state.home.counts.attention > 0) {
          button.append(
            createElement(
              "span",
              "nav-badge",
              String(state.home.counts.attention),
            ),
          );
        }
        group.append(button);
      }
      return group;
    }),
  );
}

function renderNotice(state: DesktopViewModel): void {
  const notice = byId("notice");
  notice.hidden = !state.notice;
  if (!state.notice) {
    notice.textContent = "";
    notice.removeAttribute("data-tone");
    return;
  }
  notice.dataset.tone = state.notice.tone;
  notice.textContent = state.notice.message;
}

function applySectionVisibility(state: DesktopViewModel): void {
  setHidden("onboarding-root", !state.onboarding.active);
  byId("app-content").hidden = state.onboarding.active;
  const activeDefinition = DESKTOP_PANELS.find(
    (panel) => panel.id === activePanel,
  );
  if (!activeDefinition || activeDefinition.section !== state.selectedSection) {
    activePanel = DEFAULT_PANEL_BY_SECTION[state.selectedSection];
  }
  for (const panel of DESKTOP_PANELS) {
    setHidden(`${panel.id}-section`, panel.id !== activePanel);
  }
}

function actionText(action: DesktopActionCard): string {
  return action.label;
}

function renderHome(state: DesktopViewModel): void {
  setText("home-hero-title", state.home.tagline);
  setText("home-hero-copy", state.home.primaryAction.description);
  setText("metric-total", String(state.home.counts.total));
  setText("metric-running", String(state.home.counts.running));
  setText("metric-attention", String(state.home.counts.attention));
  setText("metric-failed-stale", String(state.home.counts.failedOrStale));

  const primary = byId<HTMLButtonElement>("home-primary-action");
  primary.textContent = actionText(state.home.primaryAction);
  primary.dataset.primaryAction = state.home.primaryAction.action;

  const preview = byId("home-preview-sessions");
  replaceSessionCards(preview, state.home.sessions, homeSessionDisclosures);
  setHidden("home-preview-empty", state.home.sessions.length > 0);
}

function renderDoctor(state: DesktopViewModel): void {
  setText("doctor-summary", state.doctor.summary);

  const facts = byId("doctor-facts");
  const entries: Array<[string, string]> = [
    ["Version", state.about.version],
    ["Platform", state.doctor.platformLabel],
    ["Host", state.settings.host],
    ["Port", String(state.settings.port)],
    ["Notifier", state.settings.notifier],
    ["Companion", state.companion.statusLabel],
    ["Mode", state.companion.modeLabel],
    ["Service", state.header.serviceBadge.label],
  ];
  facts.replaceChildren(
    ...entries.flatMap(([key, value]) => [
      createElement("dt", undefined, key),
      createElement("dd", undefined, value),
    ]),
  );

  const checks = byId("doctor-checks");
  checks.replaceChildren(
    ...state.doctor.checks.map((check) => {
      const card = createElement("article", "check-card");
      card.dataset.status = check.status;
      card.append(
        createElement(
          "strong",
          "check-status",
          `[${check.status}] ${check.id}`,
        ),
        createElement("p", "check-copy", check.message),
      );
      if (check.action) {
        card.append(
          createElement("p", "check-copy", `Action: ${check.action}`),
        );
      }
      return card;
    }),
  );
}

function integrationButton(
  card: DesktopIntegrationCard,
  kind: "setup" | "verification" | "select" | "install" | "inspect",
): HTMLButtonElement {
  const button = createElement(
    "button",
    kind === "select" ? "primary-button" : "secondary-button",
  ) as HTMLButtonElement;
  button.type = "button";
  button.dataset.integration = card.id;
  if (kind === "setup" || kind === "verification" || kind === "select") {
    button.dataset.copyKind = kind;
  } else {
    button.dataset.integrationAction = kind;
  }
  button.textContent =
    kind === "setup"
      ? card.copySetupLabel
      : kind === "verification"
        ? (card.copyVerificationLabel ?? "Copy verification command")
        : kind === "install"
          ? "Install safely"
          : kind === "inspect"
            ? "Check status"
            : card.highlight
              ? "Selected"
              : "Choose this path";
  button.disabled = kind === "verification" && !card.verificationCommand;
  return button;
}

function renderIntegrationCard(
  card: DesktopIntegrationCard,
  options: { includeSelectButton: boolean },
): HTMLElement {
  const article = createElement("article", "integration-card");
  article.classList.toggle("highlight", card.highlight);

  const topLine = createElement("div", "integration-topline");
  topLine.append(
    createElement("span", "chip", card.maturity),
    createElement("span", "chip", card.observed),
  );

  article.append(
    topLine,
    createElement("h4", "session-title", card.title),
    createElement("p", "integration-copy", card.observes),
    createElement("p", "integration-copy", card.boundary),
    createElement("p", "integration-copy", card.setupStatus),
  );

  const actions = createElement("div", "integration-actions");
  actions.append(integrationButton(card, "setup"));
  if (card.id === "claude-code" || card.id === "codex") {
    actions.append(integrationButton(card, "install"));
    actions.append(integrationButton(card, "inspect"));
  }
  if (card.verificationCommand) {
    actions.append(integrationButton(card, "verification"));
  }
  if (options.includeSelectButton) {
    actions.append(integrationButton(card, "select"));
  }
  article.append(actions);
  return article;
}

function renderAgents(state: DesktopViewModel): void {
  const cards = byId("agent-cards");
  cards.replaceChildren(
    ...state.integrations.map((card) =>
      renderIntegrationCard(card, { includeSelectButton: false }),
    ),
  );
  const experimental = document.getElementById("experimental-agent-cards");
  if (experimental) {
    experimental.replaceChildren(
      ...state.experimentalIntegrations.map((card) =>
        renderIntegrationCard(card, { includeSelectButton: false }),
      ),
    );
  }
}

function renderCompanion(state: DesktopViewModel): void {
  setText(
    "companion-status-title",
    `Companion ${state.companion.statusLabel.toLowerCase()}`,
  );
  setText(
    "companion-status-copy",
    state.companion.visible
      ? "The floating surface is ready for quick agent checks while you work elsewhere."
      : "Show the companion to keep live multi-agent status nearby without the browser dashboard.",
  );

  const facts = byId("companion-facts");
  const entries: Array<[string, string]> = [
    ["Visibility", state.companion.statusLabel],
    ["Mode", state.companion.modeLabel],
    ["Always on top", state.companion.alwaysOnTop ? "Enabled" : "Disabled"],
    ["Top session", state.companion.topSession ?? "No current session"],
    [
      "Last update",
      state.companion.updatedAt
        ? new Date(state.companion.updatedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Waiting for local status",
    ],
  ];
  facts.replaceChildren(
    ...entries.flatMap(([key, value]) => [
      createElement("dt", undefined, key),
      createElement("dd", undefined, value),
    ]),
  );
}

function renderDemo(state: DesktopViewModel): void {
  setText("demo-summary", state.demo.summary);
  const sessions = byId("demo-sessions");
  replaceSessionCards(sessions, state.demo.sessions, demoSessionDisclosures);
  setHidden("demo-empty", state.demo.sessions.length > 0);
}

function renderAccentOptions(state: DesktopViewModel): void {
  const root = byId("accent-options");
  const accents: Array<["teal" | "amber" | "azure", string]> = [
    ["teal", "Radar teal"],
    ["amber", "Signal amber"],
    ["azure", "Loopback blue"],
  ];
  root.replaceChildren(
    ...accents.map(([accent, label]) => {
      const button = createElement(
        "button",
        "accent-option",
      ) as HTMLButtonElement;
      button.type = "button";
      button.dataset.accent = accent;
      button.classList.toggle("active", state.appearance.accent === accent);
      button.append(
        createElement("span", "accent-swatch"),
        createElement("strong", undefined, label),
      );
      return button;
    }),
  );
}

function renderRemote(state: DesktopViewModel): void {
  const list = byId("remote-hosts-list");
  const isEmpty = state.remote.hosts.length === 0;
  setHidden("remote-hosts-empty", !isEmpty);

  list.replaceChildren(
    ...state.remote.hosts.map((host) => {
      const card = createElement("article", "remote-card");

      const header = createElement("div", "remote-header");
      header.append(createElement("h4", "remote-alias", host.alias));

      const status = createElement(
        "span",
        `remote-status ${host.tunnelState}`,
        host.tunnelState.toUpperCase(),
      );
      header.append(status);

      card.append(header);

      if (host.hostname) {
        card.append(
          createElement("p", "remote-detail", `HostName: ${host.hostname}`),
        );
      }
      if (host.user) {
        card.append(createElement("p", "remote-detail", `User: ${host.user}`));
      }
      if (host.port) {
        card.append(createElement("p", "remote-detail", `Port: ${host.port}`));
      }

      if (host.tunnelMessage) {
        card.append(
          createElement("p", "remote-detail stuck-warning", host.tunnelMessage),
        );
      }

      if (host.tunnelState === "connected" && host.hasCli !== undefined) {
        if (host.hasCli) {
          card.append(
            createElement(
              "p",
              "remote-detail",
              "✅ Remote Crewlight CLI installed",
            ),
          );
        } else {
          const container = createElement("div", "remote-detail-warning-row");
          container.style.display = "flex";
          container.style.alignItems = "center";
          container.style.gap = "8px";
          container.style.marginTop = "4px";

          const warningText = createElement(
            "span",
            "remote-detail stuck-warning",
            "⚠️ Remote Crewlight CLI missing.",
          );
          const guideBtn = createElement(
            "button",
            "text-link-button",
            "Setup Guide",
          );
          guideBtn.style.background = "none";
          guideBtn.style.border = "none";
          guideBtn.style.color = "var(--accent)";
          guideBtn.style.cursor = "pointer";
          guideBtn.style.textDecoration = "underline";
          guideBtn.style.padding = "0";
          guideBtn.style.fontSize = "inherit";

          guideBtn.addEventListener("click", () => {
            openRemoteInstallDialog(host.alias, guideBtn);
          });

          container.append(warningText, guideBtn);
          card.append(container);
        }
      }

      const autoConnectRow = createElement("div", "remote-auto-connect-row");
      autoConnectRow.style.display = "flex";
      autoConnectRow.style.alignItems = "center";
      autoConnectRow.style.gap = "8px";
      autoConnectRow.style.marginTop = "8px";
      autoConnectRow.style.marginBottom = "8px";

      const autoConnectCheckbox = document.createElement("input");
      autoConnectCheckbox.type = "checkbox";
      autoConnectCheckbox.id = `auto-connect-${host.alias}`;
      autoConnectCheckbox.checked = !!host.autoConnect;
      autoConnectCheckbox.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        window.crewlightDesktop.perform({
          type: "remote:set-auto-connect",
          alias: host.alias,
          enabled: checked,
        });
      });

      const autoConnectLabel = document.createElement("label");
      autoConnectLabel.htmlFor = `auto-connect-${host.alias}`;
      autoConnectLabel.textContent = "Auto-connect on startup";
      autoConnectLabel.style.fontSize = "0.85rem";
      autoConnectLabel.style.cursor = "pointer";

      autoConnectRow.append(autoConnectCheckbox, autoConnectLabel);
      card.append(autoConnectRow);

      const actions = createElement("div", "remote-actions");
      if (host.tunnelState === "disconnected" || host.tunnelState === "error") {
        const btn = createElement("button", "primary-button", "Connect");
        btn.type = "button";
        btn.addEventListener("click", () => {
          window.crewlightDesktop.perform({
            type: "remote:connect",
            alias: host.alias,
          });
        });
        actions.append(btn);
      } else {
        const btn = createElement("button", "secondary-button", "Disconnect");
        btn.type = "button";
        btn.addEventListener("click", () => {
          window.crewlightDesktop.perform({
            type: "remote:disconnect",
            alias: host.alias,
          });
        });
        actions.append(btn);
      }

      card.append(actions);
      return card;
    }),
  );
}

function renderAppearance(state: DesktopViewModel): void {
  byId<HTMLSelectElement>("theme-select").value = state.appearance.theme;
  byId<HTMLSelectElement>("density-select").value = state.appearance.density;
  byId<HTMLInputElement>("companion-visible-pref").checked =
    state.settings.companionVisibilityPreference;
  renderAccentOptions(state);
}

function renderSettings(state: DesktopViewModel): void {
  byId<HTMLSelectElement>("host-select").value = state.settings.host;
  byId<HTMLInputElement>("port-input").value = String(state.settings.port);
  byId<HTMLSelectElement>("notifier-select").value = state.settings.notifier;
  byId<HTMLSelectElement>("locale-select").value = state.settings.locale;
  byId<HTMLInputElement>("auto-start-toggle").checked =
    state.settings.serviceAutoStart;
}

function renderAbout(state: DesktopViewModel): void {
  setText("about-title", `Crewlight ${state.about.version}`);
  // Also update the sidebar footer version label
  const sidebarVersion = document.getElementById("sidebar-version");
  if (sidebarVersion) {
    sidebarVersion.textContent = state.about.version;
  }
  setText("about-tagline", state.about.tagline);
  const migration = byId("about-migration");
  migration.replaceChildren(
    ...state.about.migrationSummary.map((item) =>
      createElement("p", undefined, item),
    ),
  );
  const boundaries = byId("about-boundaries");
  boundaries.replaceChildren(
    ...state.about.boundaries.map((item) =>
      createElement("p", undefined, item),
    ),
  );
}

function onboardingBody(
  state: DesktopViewModel,
  step: DesktopOnboardingStep,
): void {
  const body = byId("onboarding-body");
  body.replaceChildren();

  if (step.id === "welcome") {
    body.append(
      createElement(
        "p",
        "section-copy",
        "Crewlight Desktop packages the main control surface, floating companion, local service control, and demo flow into one local-first Windows app.",
      ),
    );
    return;
  }

  if (step.id === "choose-integration" || step.id === "trust-or-setup") {
    const intro = createElement(
      "p",
      "section-copy",
      step.id === "choose-integration"
        ? "Choose Claude Code or Codex. You can change this later in Connect."
        : "Install safely, then open the tool's /hooks view and trust the definition before running a real turn.",
    );
    const grid = createElement("div", "integration-grid");
    grid.append(
      ...state.integrations.map((card) =>
        renderIntegrationCard(card, { includeSelectButton: true }),
      ),
    );
    body.append(intro, grid);
    return;
  }

  if (step.id === "finish") {
    body.append(
      createElement(
        "p",
        "section-copy",
        "Finish into Home after a real Claude Code or Codex event is visible.",
      ),
    );
    return;
  }

  const info = createElement("article", "panel-card");
  info.append(
    createElement("p", "section-copy", step.description),
    createElement(
      "p",
      "section-copy",
      step.id === "start-service"
        ? state.header.serviceBadge.label
        : step.id === "first-real-event"
          ? "Run a real turn; installation and demo data do not complete onboarding."
          : "Run a real turn; demo data is optional and never completes onboarding.",
    ),
  );
  body.append(info);
}

function renderOnboarding(state: DesktopViewModel): void {
  if (!state.onboarding.active) {
    onboardingStepIndex = 0;
    return;
  }

  const steps = state.onboarding.steps;
  const current = steps[onboardingStepIndex] ?? steps[steps.length - 1];
  if (!current) {
    return;
  }
  setText("onboarding-title", current.title);
  setText("onboarding-description", current.description);

  const progress = byId("onboarding-progress");
  progress.replaceChildren(
    ...steps.map((step, index) => {
      const item = createElement("div", "onboarding-step");
      item.classList.toggle("active", index === onboardingStepIndex);
      item.classList.toggle("complete", step.complete);
      item.setAttribute(
        "aria-label",
        `Step ${index + 1} of ${steps.length}: ${step.title}. ${step.description}`,
      );
      item.append(
        createElement("span", "onboarding-step-number", String(index + 1)),
        createElement("strong", undefined, step.title),
      );
      return item;
    }),
  );

  const primary = byId<HTMLButtonElement>("onboarding-primary");
  const secondary = byId<HTMLButtonElement>("onboarding-secondary");
  primary.disabled =
    current.id === "choose-integration" && !state.settings.preferredIntegration;
  primary.textContent =
    current.id === "welcome"
      ? "Start onboarding"
      : current.id === "finish"
        ? "Finish into Home"
        : current.id === "choose-integration"
          ? "Continue"
          : current.complete
            ? "Continue"
            : current.id === "start-service"
              ? "Start local service"
              : current.id === "trust-or-setup"
                ? "Open Connect"
                : current.id === "first-real-event"
                  ? "Run a real turn"
                  : "Continue";
  secondary.textContent =
    current.id === "finish" ? "Review later" : "Skip for now";

  onboardingBody(state, current);
}

function syncOnboardingProgress(state: DesktopViewModel): void {
  if (!state.onboarding.active || onboardingStepIndex === 0) {
    return;
  }
  while (onboardingStepIndex < state.onboarding.steps.length - 1) {
    const step = state.onboarding.steps[onboardingStepIndex];
    if (!step?.complete) {
      break;
    }
    onboardingStepIndex += 1;
  }
}

function render(state: DesktopViewModel): void {
  latestState = state;
  const currentPanel = DESKTOP_PANELS.find((panel) => panel.id === activePanel);
  if (!currentPanel || currentPanel.section !== state.selectedSection) {
    activePanel = DEFAULT_PANEL_BY_SECTION[state.selectedSection];
  }
  document.body.dataset.theme = state.appearance.theme;
  document.body.dataset.accent = state.appearance.accent;
  document.body.dataset.density = state.appearance.density;

  const activeDefinition = DESKTOP_PANELS.find(
    (panel) => panel.id === activePanel,
  );
  setText(
    "page-title",
    activeDefinition?.label ?? SECTION_LABEL(state.selectedSection),
  );
  setText("page-subtitle", activeDefinition?.subtitle ?? state.header.summary);
  setText("service-badge", state.header.serviceBadge.label);
  byId("service-badge").className =
    `status-badge ${state.header.serviceBadge.tone}`;
  setText("last-updated", state.header.lastUpdatedLabel);

  renderSidebar(state);
  renderNotice(state);
  renderHome(state);
  renderRemote(state);
  renderDoctor(state);
  renderAgents(state);
  renderCompanion(state);
  renderDemo(state);
  renderAppearance(state);
  renderSettings(state);
  renderAbout(state);
  syncOnboardingProgress(state);
  renderOnboarding(state);
  applySectionVisibility(state);
}

function SECTION_LABEL(section: DesktopViewModel["selectedSection"]): string {
  return (
    latestState?.sections.find((candidate) => candidate.id === section)
      ?.label ?? "Crewlight Desktop"
  );
}

async function performPrimaryHomeAction(): Promise<void> {
  if (!latestState) {
    return;
  }
  const action = latestState.home.primaryAction.action;
  if (action === "start-service") {
    await window.crewlightDesktop.perform({ type: "service:start" });
    return;
  }
  if (action === "run-demo") {
    await window.crewlightDesktop.perform({ type: "demo:run" });
    return;
  }
  await window.crewlightDesktop.perform({ type: "companion:show" });
  await window.crewlightDesktop.perform({ type: "companion:bring-to-front" });
}

async function performOnboardingPrimary(): Promise<void> {
  if (!latestState) {
    return;
  }

  const step = latestState.onboarding.steps[onboardingStepIndex];
  if (!step) {
    return;
  }

  if (step.id === "welcome") {
    onboardingStepIndex += 1;
    render(latestState);
    return;
  }
  if (step.id === "start-service") {
    if (!step.complete) {
      await window.crewlightDesktop.perform({ type: "service:start" });
      return;
    }
    onboardingStepIndex += 1;
    render(latestState);
    return;
  }
  if (step.id === "choose-integration") {
    onboardingStepIndex += 1;
    render(latestState);
    return;
  }
  if (step.id === "trust-or-setup") {
    await window.crewlightDesktop.perform({
      type: "preferences:set-last-section",
      section: "connect",
    });
    if (!step.complete) {
      return;
    }
    onboardingStepIndex += 1;
    render(latestState);
    return;
  }
  if (step.id === "first-real-event") {
    if (!step.complete) {
      await window.crewlightDesktop.perform({
        type: "preferences:set-last-section",
        section: "home",
      });
      return;
    }
    onboardingStepIndex += 1;
    render(latestState);
    return;
  }
  await window.crewlightDesktop.perform({ type: "onboarding:complete" });
}

function advanceOnboarding(): void {
  if (!latestState) {
    return;
  }
  onboardingStepIndex = Math.min(
    onboardingStepIndex + 1,
    latestState.onboarding.steps.length - 1,
  );
  render(latestState);
}

function integrationById(
  id: PreferredIntegration,
): DesktopIntegrationCard | undefined {
  return latestState?.integrations.find((card) => card.id === id);
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const navButton = target.closest<HTMLButtonElement>(".nav-button");
  if (navButton?.dataset.section && navButton.dataset.panel) {
    activePanel = navButton.dataset.panel as DesktopPanelId;
    await window.crewlightDesktop.perform({
      type: "preferences:set-last-section",
      section: navButton.dataset.section as DesktopViewModel["selectedSection"],
    });
    if (latestState?.selectedSection === navButton.dataset.section) {
      render(latestState);
    }
    return;
  }

  const primaryAction = target.closest<HTMLButtonElement>(
    "#home-primary-action",
  );
  if (primaryAction) {
    await performPrimaryHomeAction();
    return;
  }

  if (target.closest("#home-open-dashboard")) {
    await window.crewlightDesktop.perform({ type: "shell:open-dashboard" });
    return;
  }

  if (target.closest("#remote-rescan-btn")) {
    await window.crewlightDesktop.perform({ type: "remote:rescan" });
    return;
  }

  const actionButton = target.closest<HTMLButtonElement>("[data-action]");
  if (actionButton?.dataset.action) {
    const action = actionButton.dataset.action;
    if (action === "companion:set-expanded") {
      await window.crewlightDesktop.perform({
        type: "companion:set-expanded",
        expanded: actionButton.dataset.expanded === "true",
      });
      return;
    }

    const actionMap = {
      "companion:bring-to-front": { type: "companion:bring-to-front" },
      "companion:hide": { type: "companion:hide" },
      "companion:show": { type: "companion:show" },
      "companion:toggle-always-on-top": {
        type: "companion:toggle-always-on-top",
      },
      "copy:diagnostic-summary": { type: "copy:diagnostic-summary" },
      "demo:run": { type: "demo:run" },
      "home:clear-ready": { type: "home:clear-ready" },
      "onboarding:start-over": { type: "onboarding:start-over" },
      "preferences:reset": { type: "preferences:reset" },
      "service:restart": { type: "service:restart" },
      "service:start": { type: "service:start" },
      "service:stop": { type: "service:stop" },
      "shell:open-repository": { type: "shell:open-repository" },
    } as const;
    const mapped = actionMap[action as keyof typeof actionMap];
    if (mapped) {
      await window.crewlightDesktop.perform(mapped);
      return;
    }
  }

  const accentOption = target.closest<HTMLButtonElement>(".accent-option");
  if (accentOption?.dataset.accent) {
    await window.crewlightDesktop.perform({
      type: "preferences:set-accent",
      accent: accentOption.dataset.accent as "amber" | "azure" | "teal",
    });
    return;
  }

  const copyButton = target.closest<HTMLButtonElement>("[data-copy-kind]");
  if (copyButton?.dataset.integration && copyButton.dataset.copyKind) {
    const card = integrationById(
      copyButton.dataset.integration as PreferredIntegration,
    );
    if (!card) {
      return;
    }
    if (copyButton.dataset.copyKind === "setup") {
      await window.crewlightDesktop.perform({
        type: "copy:text",
        text: card.setupCommand,
      });
      return;
    }
    if (
      copyButton.dataset.copyKind === "verification" &&
      card.verificationCommand
    ) {
      await window.crewlightDesktop.perform({
        type: "copy:text",
        text: card.verificationCommand,
      });
      return;
    }
    if (copyButton.dataset.copyKind === "select") {
      await window.crewlightDesktop.perform({
        type: "preferences:select-integration",
        integration: card.id,
      });
    }
    return;
  }

  const integrationAction = target.closest<HTMLButtonElement>(
    "[data-integration-action]",
  );
  if (
    integrationAction?.dataset.integration &&
    (integrationAction.dataset.integration === "claude-code" ||
      integrationAction.dataset.integration === "codex")
  ) {
    await window.crewlightDesktop.perform({
      type:
        integrationAction.dataset.integrationAction === "install"
          ? "integration:install"
          : "integration:inspect",
      integration: integrationAction.dataset.integration,
    });
    return;
  }

  if (target.closest("#onboarding-primary")) {
    await performOnboardingPrimary();
    return;
  }

  if (target.closest("#onboarding-secondary")) {
    const step = latestState?.onboarding.steps[onboardingStepIndex];
    if (step?.id === "finish") {
      await window.crewlightDesktop.perform({ type: "onboarding:complete" });
    } else {
      advanceOnboarding();
    }
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.id === "theme-select") {
    await window.crewlightDesktop.perform({
      type: "preferences:set-theme",
      theme: (target as HTMLSelectElement).value as "dark" | "light" | "system",
    });
    return;
  }
  if (target.id === "density-select") {
    await window.crewlightDesktop.perform({
      type: "preferences:set-density",
      density: (target as HTMLSelectElement).value as "comfortable" | "compact",
    });
    return;
  }
  if (target.id === "companion-visible-pref") {
    await window.crewlightDesktop.perform({
      type: "preferences:set-companion-visibility",
      visible: (target as HTMLInputElement).checked,
    });
    return;
  }
  if (target.id === "host-select") {
    await window.crewlightDesktop.perform({
      type: "service:set-host",
      host: (target as HTMLSelectElement).value,
    });
    return;
  }
  if (target.id === "port-input") {
    const value = Number((target as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= 1 && value <= 65_535) {
      await window.crewlightDesktop.perform({
        type: "service:set-port",
        port: value,
      });
    }
    return;
  }
  if (target.id === "notifier-select") {
    await window.crewlightDesktop.perform({
      type: "service:set-notifier",
      notifier: (target as HTMLSelectElement).value as
        | "console"
        | "none"
        | "os",
    });
    return;
  }
  if (target.id === "locale-select") {
    await window.crewlightDesktop.perform({
      type: "preferences:set-locale",
      locale: (target as HTMLSelectElement).value as "system" | "en" | "zh-CN",
    });
    return;
  }
  if (target.id === "auto-start-toggle") {
    await window.crewlightDesktop.perform({
      type: "preferences:set-service-auto-start",
      enabled: (target as HTMLInputElement).checked,
    });
  }
});

window.crewlightDesktop.onState((state) => {
  render(state);
});

void window.crewlightDesktop.getState().then((state) => {
  render(state);
});

const modalDismissBtn = byId("remote-install-dismiss");
if (modalDismissBtn) {
  modalDismissBtn.addEventListener("click", async () => {
    const modal = byId("remote-install-modal");
    const alias = modal.dataset.alias;
    closeRemoteInstallDialog();
    if (alias) {
      await window.crewlightDesktop.perform({
        type: "remote:dismiss-install-prompt",
        alias,
      });
    }
  });
}

document.addEventListener("keydown", (event) => {
  const modal = byId("remote-install-modal");
  if (modal.hidden) {
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeRemoteInstallDialog();
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = Array.from(
    modal.querySelectorAll<HTMLElement>("button:not([disabled])"),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
