import type {
  DesktopActionCard,
  DesktopIntegrationCard,
  DesktopOnboardingStep,
  DesktopSessionCard,
  DesktopViewModel,
} from "./desktop-state.js";
import type {
  DesktopLocale,
  PreferredIntegration,
} from "./desktop-preferences.js";
import { DisclosureState } from "./interaction.js";

let latestState: DesktopViewModel | undefined;
let onboardingStepIndex = 0;
let sessionDetailId = 0;
let dialogReturnFocus: HTMLElement | undefined;
const homeSessionDisclosures = new DisclosureState();
const demoSessionDisclosures = new DisclosureState();
const originalStaticText = new WeakMap<Element, string>();

const STATIC_ZH: Record<string, string> = {
  "Crewlight Desktop": "Crewlight 桌面版",
  Language: "语言",
  "AI agent activity radar, local-first.": "本地优先的 AI 代理活动雷达。",
  "Loopback only · privacy first": "仅限本机 · 隐私优先",
  "Command Center": "代理指挥台",
  "Local service stopped": "本地服务已停止",
  "Waiting for local status": "等待本地状态",
  "First run": "首次使用",
  "Welcome to Crewlight Desktop": "欢迎使用 Crewlight 桌面版",
  Continue: "继续",
  "Skip for now": "暂时跳过",
  Home: "首页",
  "Open browser dashboard": "打开浏览器面板",
  "Total sessions": "全部会话",
  Running: "运行中",
  "Needs attention": "需要处理",
  "Failed / stale": "失败 / 停滞",
  "Live session preview": "实时会话",
  "Current local activity": "当前本地活动",
  "No sessions yet": "还没有会话",
  "Start the local service and run the demo to see Crewlight in motion.":
    "启动本地服务并运行演示，即可看到 Crewlight 的完整工作状态。",
  "SSH Port Forwarding": "SSH 端口转发",
  "Remote connections": "远程连接",
  "Rescan ssh config": "重新扫描 SSH 配置",
  Status: "状态",
  "Active SSH Tunnels": "活动 SSH 隧道",
  "Remote events will be securely received on your local loopback address.":
    "远程事件会通过本机回环地址安全接收。",
  Hosts: "主机",
  "Detected Remote Hosts": "检测到的远程主机",
  "No remote hosts detected": "未检测到远程主机",
  Doctor: "诊断",
  "Local diagnostics": "本地诊断",
  "Start local service": "启动本地服务",
  Restart: "重启",
  Stop: "停止",
  "Copy diagnostic summary": "复制诊断摘要",
  Runtime: "运行环境",
  "Desktop and daemon state": "桌面与服务状态",
  Checks: "检查项",
  "Detailed health report": "详细健康报告",
  Integrations: "接入",
  "Choose a setup path": "选择接入方式",
  "Crewlight stays local-first and read-only. Integration cards expose setup snippets, verification commands, and honest boundaries.":
    "Crewlight 始终本地优先且只读。接入卡片会提供配置片段、验证命令和明确的能力边界。",
  "Floating companion": "悬浮伴侣",
  "Keep live status nearby": "让实时状态始终近在眼前",
  "Show companion": "显示悬浮伴侣",
  "Hide companion": "隐藏悬浮伴侣",
  "Bring to front": "置于前台",
  "Compact mode": "紧凑模式",
  "Expanded mode": "展开模式",
  "Toggle always on top": "切换始终置顶",
  "Companion hidden": "悬浮伴侣已隐藏",
  Demo: "演示",
  "Run the local multi-agent scenario": "运行本地多代理场景",
  "Run multi-agent demo": "运行多代理演示",
  "Synthetic data only": "仅使用合成数据",
  "Safe, local, repeatable": "安全、本地、可重复",
  "The demo uses deterministic local sessions. No real prompts, transcripts, tool I/O, or cloud data are involved.":
    "演示使用可重复的本地会话，不涉及真实提示词、对话、工具输入输出或云端数据。",
  "Scenario sessions": "场景会话",
  "Demo session list": "演示会话列表",
  "Demo not loaded yet": "演示尚未载入",
  "Run the scenario to populate Home, Demo, and Companion together.":
    "运行场景后，首页、演示和悬浮伴侣会同步显示会话。",
  Appearance: "外观",
  "Saved desktop preferences": "已保存的桌面偏好",
  "Theme, accent, density, and companion visibility preference persist locally.":
    "主题、强调色、密度和悬浮伴侣可见性都会保存在本机。",
  Theme: "主题",
  System: "跟随系统",
  Light: "浅色",
  Dark: "深色",
  Density: "密度",
  Comfortable: "舒适",
  Compact: "紧凑",
  "Show companion when Crewlight Desktop launches":
    "启动 Crewlight 时显示悬浮伴侣",
  "Accent and motion": "强调色与动效",
  "Visual tone": "视觉风格",
  "The companion and main window share this token set. Reduced motion is respected.":
    "悬浮伴侣和主窗口共用这套视觉变量，并遵循系统的减少动态效果设置。",
  "Local service": "本地服务",
  "Current app-session settings": "当前应用会话设置",
  "Host, port, and notifier apply to the next service start or restart.":
    "主机、端口和通知方式会在下次启动或重启服务时生效。",
  Host: "主机",
  Port: "端口",
  Notifier: "通知方式",
  Console: "控制台",
  None: "无",
  OS: "系统通知",
  "Attempt to start the local service when the desktop app launches":
    "桌面应用启动时尝试启动本地服务",
  "Desktop state": "桌面状态",
  "Reset or replay": "重置或重新引导",
  "Reset only desktop UI preferences. No prompts, transcripts, sessions, or raw payloads are persisted.":
    "仅重置桌面界面偏好；提示词、对话、会话和原始载荷都不会被持久化。",
  "Reset desktop UI state": "重置桌面界面状态",
  "Replay onboarding": "重新开始引导",
  About: "关于",
  "Open repository": "打开代码仓库",
  "Install Crewlight CLI on Remote Host": "在远程主机安装 Crewlight CLI",
  "Got it": "知道了",
  Precise: "精确",
  "Precise lifecycle": "精确生命周期",
  "Manual / Experimental bridge": "手动 / 实验性桥接",
  "Implemented, verification pending": "已实现，等待验证",
  "Manual / Custom ingest": "手动 / 自定义接入",
  "Observed in current daemon": "当前服务已观察到活动",
  "Ready to configure": "可以开始配置",
  "Manual bridge available": "可使用手动桥接",
  "Plugin scaffold ready": "插件脚手架已就绪",
  "Manual path available": "可使用手动路径",
  "Live activity detected": "已检测到实时活动",
  "Mergeable snippet ready": "可合并的配置片段已就绪",
  "Hooks snippet ready": "Hooks 配置片段已就绪",
  "Manual commands ready": "手动命令已就绪",
  "Manual path ready": "手动路径已就绪",
  "Copy setup snippet": "复制配置片段",
  "Copy verification command": "复制验证命令",
  "Copy setup commands": "复制配置命令",
  "Copy plugin file": "复制插件文件",
  "Copy ingest command": "复制接入命令",
  "Session start, prompts, notifications, permissions, tools, stop, and failures.":
    "会话启动、提示、通知、权限、工具、停止和失败状态。",
  "Session, prompt, tool, permission, and stop events after trust review.":
    "经信任审查后的会话、提示、工具、权限和停止事件。",
  "Explicit terminal or task-driven status updates only.":
    "仅观察显式终端或任务驱动的状态更新。",
  "Session and permission lifecycle updates from the local OpenCode plugin.":
    "来自本地 OpenCode 插件的会话和权限生命周期更新。",
  "Manual normalized events, generic CLI wrapping, and bounded local probes.":
    "手动规范化事件、通用 CLI 包装和有边界的本地探测。",
  "Observes documented Claude Code lifecycle hooks without modifying Claude settings.":
    "通过公开的 Claude Code 生命周期 Hooks 观察状态，不修改 Claude 设置。",
  "Observes Codex notify and hooks only. Crewlight does not approve permissions or return turn-control output.":
    "仅观察 Codex notify 和 Hooks；Crewlight 不会批准权限或返回回合控制输出。",
  "Manual / Experimental bridge. No automatic Cursor lifecycle hook or private API scraping is claimed.":
    "手动 / 实验性桥接；不声称拥有 Cursor 自动生命周期 Hooks，也不抓取私有 API。",
  "Uses documented local plugin events and keeps payload handling allowlisted and local.":
    "使用公开的本地插件事件，并仅在本地按白名单处理载荷。",
  "Use manual ingest or local probes only. No private API scraping, hidden permissions, or background control paths.":
    "仅使用手动接入或本地探测；不抓取私有 API，不使用隐藏权限或后台控制路径。",
};

function currentLocale(): DesktopLocale {
  return latestState?.appearance.locale ?? "en";
}

function tr(english: string, chinese: string): string {
  return currentLocale() === "zh-CN" ? chinese : english;
}

function localized(value: string): string {
  return currentLocale() === "zh-CN" ? (STATIC_ZH[value] ?? value) : value;
}

function applyStaticLocale(locale: DesktopLocale): void {
  document.documentElement.lang = locale;
  document.title =
    locale === "zh-CN" ? "Crewlight 桌面版" : "Crewlight Desktop";
  for (const element of Array.from(document.querySelectorAll("body *"))) {
    if (element.children.length > 0) {
      continue;
    }
    const original =
      originalStaticText.get(element) ??
      element.textContent?.replace(/\s+/gu, " ").trim();
    if (!original) {
      continue;
    }
    originalStaticText.set(element, original);
    const translated = locale === "zh-CN" ? STATIC_ZH[original] : original;
    if (translated) {
      element.textContent = translated;
    }
  }
  byId("sidebar-nav").setAttribute(
    "aria-label",
    locale === "zh-CN" ? "主要页面" : "Primary sections",
  );
  const brandEyebrow = document.querySelector(".brand-eyebrow");
  if (brandEyebrow) {
    brandEyebrow.textContent = "CREWLIGHT DESKTOP";
  }
  byId("locale-select").setAttribute(
    "aria-label",
    locale === "zh-CN" ? "语言" : "Language",
  );
}

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
      createElement(
        "span",
        "chip remote-chip",
        `Remote · ${session.remoteAlias}`,
      ),
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
        tr(
          "Possibly stuck · no events for 5m",
          "可能已停滞 · 5 分钟没有新事件",
        ),
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

  addDetailLine(tr("Workspace", "工作区"), session.workspace);
  addDetailLine(tr("Status", "状态"), session.statusLabel);
  addDetailLine(tr("Activity", "活动"), session.activity);
  if (session.diagnosticHint) {
    addDetailLine(tr("Diagnostic", "诊断"), session.diagnosticHint);
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
    toggle.textContent = isExpanded
      ? tr("Hide details", "收起详情")
      : tr("Show details", "查看详情");
    toggle.setAttribute(
      "aria-label",
      isExpanded
        ? tr(
            `Hide details for ${session.title}`,
            `收起 ${session.title} 的详情`,
          )
        : tr(
            `Show details for ${session.title}`,
            `查看 ${session.title} 的详情`,
          ),
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
  nav.replaceChildren(
    ...state.sections.map((section) => {
      const button = createElement("button", "nav-button");
      button.type = "button";
      button.dataset.section = section.id;
      button.disabled = state.onboarding.active;
      button.classList.toggle("active", section.active);
      button.append(
        createElement("span", undefined, section.label),
        createElement(
          "span",
          undefined,
          section.id === "home" ? tr("Primary", "主要") : " ",
        ),
      );
      return button;
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
  notice.textContent = localized(state.notice.message);
}

function applySectionVisibility(state: DesktopViewModel): void {
  setHidden("onboarding-root", !state.onboarding.active);
  byId("app-content").hidden = state.onboarding.active;
  for (const section of state.sections) {
    setHidden(`${section.id}-section`, section.id !== state.selectedSection);
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
  replaceSessionCards(
    preview,
    state.home.previewSessions,
    homeSessionDisclosures,
  );
  setHidden("home-preview-empty", state.home.previewSessions.length > 0);
}

function renderDoctor(state: DesktopViewModel): void {
  setText("doctor-summary", state.doctor.summary);

  const facts = byId("doctor-facts");
  const entries: Array<[string, string]> = [
    [tr("Version", "版本"), state.about.version],
    [tr("Platform", "平台"), state.doctor.platformLabel],
    [tr("Host", "主机"), state.settings.host],
    [tr("Port", "端口"), String(state.settings.port)],
    [tr("Notifier", "通知方式"), state.settings.notifier],
    [tr("Companion", "悬浮伴侣"), state.companion.statusLabel],
    [tr("Mode", "模式"), state.companion.modeLabel],
    [tr("Service", "服务"), state.header.serviceBadge.label],
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
          createElement(
            "p",
            "check-copy",
            `${tr("Action", "建议操作")}: ${check.action}`,
          ),
        );
      }
      return card;
    }),
  );
}

function integrationButton(
  card: DesktopIntegrationCard,
  kind: "setup" | "verification" | "select",
): HTMLButtonElement {
  const button = createElement(
    "button",
    kind === "select" ? "primary-button" : "secondary-button",
  ) as HTMLButtonElement;
  button.type = "button";
  button.dataset.integration = card.id;
  button.dataset.copyKind = kind;
  button.textContent =
    kind === "setup"
      ? localized(card.copySetupLabel)
      : kind === "verification"
        ? localized(
            card.copyVerificationLabel ??
              tr("Copy verification command", "复制验证命令"),
          )
        : card.highlight
          ? tr("Selected", "已选择")
          : tr("Choose this path", "选择此方式");
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
    createElement("span", "chip", localized(card.maturity)),
    createElement("span", "chip", localized(card.observed)),
  );

  article.append(
    topLine,
    createElement("h4", "session-title", card.title),
    createElement("p", "integration-copy", localized(card.observes)),
    createElement("p", "integration-copy", localized(card.boundary)),
    createElement("p", "integration-copy", localized(card.setupStatus)),
  );

  const actions = createElement("div", "integration-actions");
  actions.append(integrationButton(card, "setup"));
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
}

function renderCompanion(state: DesktopViewModel): void {
  setText(
    "companion-status-title",
    tr(
      `Companion ${state.companion.statusLabel.toLowerCase()}`,
      `悬浮伴侣${state.companion.visible ? "已显示" : "已隐藏"}`,
    ),
  );
  setText(
    "companion-status-copy",
    state.companion.visible
      ? tr(
          "The floating surface is ready for quick agent checks while you work elsewhere.",
          "悬浮界面已就绪，你可以在其他窗口工作时快速查看代理状态。",
        )
      : tr(
          "Show the companion to keep live multi-agent status nearby without the browser dashboard.",
          "显示悬浮伴侣，无需打开浏览器面板也能随时查看多代理状态。",
        ),
  );

  const facts = byId("companion-facts");
  const entries: Array<[string, string]> = [
    [tr("Visibility", "可见性"), state.companion.statusLabel],
    [tr("Mode", "模式"), state.companion.modeLabel],
    [
      tr("Always on top", "始终置顶"),
      state.companion.alwaysOnTop
        ? tr("Enabled", "已启用")
        : tr("Disabled", "已停用"),
    ],
    [
      tr("Top session", "首要会话"),
      state.companion.topSession ?? tr("No current session", "暂无会话"),
    ],
    [
      tr("Last update", "最近更新"),
      state.companion.updatedAt
        ? new Date(state.companion.updatedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : tr("Waiting for local status", "等待本地状态"),
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
    ["teal", tr("Radar teal", "雷达青")],
    ["amber", tr("Signal amber", "信号琥珀")],
    ["azure", tr("Loopback blue", "回环蓝")],
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
              tr("Remote Crewlight CLI installed", "远程 Crewlight CLI 已安装"),
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
            tr("Remote Crewlight CLI missing.", "远程主机缺少 Crewlight CLI。"),
          );
          const guideBtn = createElement(
            "button",
            "text-link-button",
            tr("Setup Guide", "安装指南"),
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
      autoConnectLabel.textContent = tr(
        "Auto-connect on startup",
        "启动时自动连接",
      );
      autoConnectLabel.style.fontSize = "0.85rem";
      autoConnectLabel.style.cursor = "pointer";

      autoConnectRow.append(autoConnectCheckbox, autoConnectLabel);
      card.append(autoConnectRow);

      const actions = createElement("div", "remote-actions");
      if (host.tunnelState === "disconnected" || host.tunnelState === "error") {
        const btn = createElement(
          "button",
          "primary-button",
          tr("Connect", "连接"),
        );
        btn.type = "button";
        btn.addEventListener("click", () => {
          window.crewlightDesktop.perform({
            type: "remote:connect",
            alias: host.alias,
          });
        });
        actions.append(btn);
      } else {
        const btn = createElement(
          "button",
          "secondary-button",
          tr("Disconnect", "断开连接"),
        );
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
        tr(
          "Crewlight Desktop packages the main control surface, floating companion, local service control, and demo flow into one local-first Windows app.",
          "Crewlight 桌面版把主控制界面、悬浮伴侣、本地服务控制和演示流程整合在一个本地优先的 Windows 应用中。",
        ),
      ),
    );
    return;
  }

  if (step.id === "choose-integration") {
    const intro = createElement(
      "p",
      "section-copy",
      tr(
        "Choose the integration path you want Crewlight to highlight first. You can change this later in Settings.",
        "选择希望 Crewlight 优先引导的接入方式，稍后可在设置中更改。",
      ),
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
        tr(
          "Finish into Home with your current local state intact. If you already ran the demo, the desktop and companion stay populated.",
          "完成后进入首页并保留当前本地状态；如果已经运行演示，桌面界面和悬浮伴侣会继续显示这些会话。",
        ),
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
        : step.id === "run-demo"
          ? state.demo.summary
          : tr(
              "The floating companion mirrors the same safe session model as Home.",
              "悬浮伴侣与首页使用同一套安全会话模型。",
            ),
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
      item.append(
        createElement("strong", undefined, step.title),
        createElement("span", "section-copy", step.description),
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
      ? tr("Start onboarding", "开始引导")
      : current.id === "finish"
        ? tr("Finish into Home", "完成并进入首页")
        : current.id === "choose-integration"
          ? tr("Continue", "继续")
          : current.complete
            ? tr("Continue", "继续")
            : current.id === "start-service"
              ? tr("Start local service", "启动本地服务")
              : current.id === "run-demo"
                ? tr("Run demo", "运行演示")
                : tr("Show companion", "显示悬浮伴侣");
  secondary.textContent =
    current.id === "finish"
      ? tr("Review later", "稍后再看")
      : tr("Skip for now", "暂时跳过");

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
  applyStaticLocale(state.appearance.locale);
  document.body.dataset.theme = state.appearance.theme;
  document.body.dataset.accent = state.appearance.accent;
  document.body.dataset.density = state.appearance.density;
  byId<HTMLSelectElement>("locale-select").value = state.appearance.locale;

  setText("page-title", SECTION_LABEL(state.selectedSection));
  setText("page-subtitle", state.header.summary);
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
  if (step.id === "run-demo") {
    if (!step.complete) {
      await window.crewlightDesktop.perform({ type: "demo:run" });
      return;
    }
    onboardingStepIndex += 1;
    render(latestState);
    return;
  }
  if (step.id === "show-companion") {
    if (!step.complete) {
      await window.crewlightDesktop.perform({ type: "companion:show" });
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
  if (navButton?.dataset.section) {
    await window.crewlightDesktop.perform({
      type: "preferences:set-last-section",
      section: navButton.dataset.section as DesktopViewModel["selectedSection"],
    });
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
  if (target.id === "locale-select") {
    await window.crewlightDesktop.perform({
      type: "preferences:set-locale",
      locale: (target as HTMLSelectElement).value as DesktopLocale,
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
