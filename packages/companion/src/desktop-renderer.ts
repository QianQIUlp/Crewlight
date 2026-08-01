import type {
  DesktopActionCard,
  DesktopIntegrationCard,
  DesktopOnboardingStep,
  DesktopSessionCard,
  DesktopViewModel,
} from "./desktop-state.js";
import { formatDesktopDuration } from "./desktop-state.js";
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
  "See agent status at a glance.": "一眼看清代理状态。",
  "This computer only · private by design": "仅限本机 · 默认保护隐私",
  "See live agent status in one place.": "在一个地方查看代理实时状态。",
  "Crewlight is off": "Crewlight 未启动",
  "Waiting for local status": "等待本地状态",
  "First run": "首次使用",
  "Welcome to Crewlight Desktop": "欢迎使用 Crewlight 桌面版",
  Continue: "继续",
  "Skip for now": "暂时跳过",
  Overview: "概览",
  "Open detailed view": "打开详细视图",
  Tasks: "任务",
  Active: "进行中",
  "Needs attention": "需要处理",
  Issues: "异常",
  "Live activity": "实时状态",
  "Current activity": "当前状态",
  "No tasks yet": "还没有任务",
  "Connect Codex or Claude Code to see activity here.":
    "接入 Codex 或 Claude Code 后，即可在这里查看状态。",
  "Remote work": "远程工作",
  "Remote computers": "远程电脑",
  "Crewlight connects only to hosts you mark in your SSH config.":
    "Crewlight 只连接你在 SSH 配置中标记的主机。",
  "Scan SSH config": "扫描 SSH 配置",
  Connections: "连接",
  Status: "状态",
  "Secure connections": "安全连接",
  "Remote activity appears here through an encrypted SSH connection.":
    "远程状态会通过加密的 SSH 连接显示在这里。",
  Computers: "电脑",
  "Detected remote computers": "已检测到的远程电脑",
  "No remote computers found": "未找到远程电脑",
  Troubleshooting: "故障排查",
  "System check": "系统检查",
  "Start Crewlight": "启动 Crewlight",
  Restart: "重启",
  Stop: "停止",
  "Copy diagnostic summary": "复制诊断摘要",
  Details: "详情",
  "Crewlight status": "Crewlight 状态",
  Results: "结果",
  "What Crewlight checked": "Crewlight 检查了什么",
  "Connect agents": "接入代理",
  "Choose an agent": "选择代理",
  "Pick an agent and follow the setup shown here. Crewlight stays local and read-only.":
    "选择代理并按提示完成接入。Crewlight 始终在本机只读运行。",
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
  "Preview common agent states": "预览常见代理状态",
  "Run demo": "运行演示",
  "Sample data only": "仅使用示例数据",
  "Private and repeatable": "私密且可重复",
  "Uses sample tasks only. It never includes your prompts or conversations.":
    "只使用示例任务，不会包含你的提示词或对话。",
  "Sample tasks": "示例任务",
  "Demo activity": "演示状态",
  "Demo not loaded yet": "演示尚未载入",
  "Run the demo to preview a few common states.":
    "运行演示，预览几种常见状态。",
  Appearance: "外观",
  "Customize Crewlight": "自定义 Crewlight",
  "Your choices are saved on this computer.": "你的选择会保存在本机。",
  Theme: "主题",
  System: "跟随系统",
  Light: "浅色",
  Dark: "深色",
  Density: "密度",
  Comfortable: "舒适",
  Compact: "紧凑",
  "Show companion when Crewlight Desktop launches":
    "启动 Crewlight 时显示悬浮伴侣",
  "Color and motion": "颜色与动效",
  "Choose a color": "选择颜色",
  "The main window and companion use the same color. Reduced motion follows your system setting.":
    "主窗口和悬浮伴侣使用相同颜色；动效会遵循系统设置。",
  "Crewlight settings": "Crewlight 设置",
  "Startup and notifications": "启动与通知",
  "Changes apply after restart.": "重启后生效。",
  "Local address": "本机地址",
  "Connection port": "连接端口",
  Notifications: "通知",
  Console: "控制台",
  Off: "关闭",
  "System notifications": "系统通知",
  "Start Crewlight when the app opens": "打开应用时启动 Crewlight",
  "App preferences": "应用偏好",
  Reset: "重置",
  "Reset appearance and onboarding only. Agent activity is not saved here.":
    "只重置外观和使用引导；这里不会保存代理活动。",
  "Reset preferences": "重置偏好",
  "Show setup guide again": "再次显示使用引导",
  About: "关于",
  "Open repository": "打开代码仓库",
  "Set up Crewlight on a remote computer": "在远程电脑上设置 Crewlight",
  "Got it": "知道了",
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

function renderSessionCard(
  session: DesktopSessionCard,
  disclosures: DisclosureState,
): HTMLElement {
  const card = createElement("article", "session-card");
  card.dataset.tone = session.tone;

  const topLine = createElement("div", "session-topline");
  const elapsedText =
    session.elapsedMs > 0
      ? ` · ${formatDesktopDuration(session.elapsedMs, currentLocale())}`
      : "";
  const sourceChip = createElement(
    "span",
    "chip",
    `${session.source}${elapsedText}`,
  );
  const identityChips = createElement("div", "session-identity-chips");
  identityChips.append(sourceChip);
  if (session.demoLabel) {
    identityChips.append(
      createElement("span", "chip demo-chip", session.demoLabel),
    );
  }
  if (session.remoteAlias) {
    identityChips.append(
      createElement(
        "span",
        "chip remote-chip",
        `${tr("Remote", "远程")} · ${session.remoteAlias}`,
      ),
    );
  }
  topLine.append(
    identityChips,
    createElement("span", "chip", session.statusLabel),
  );

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
        tr("Possibly stuck · no updates for 5m", "可能已停滞 · 5 分钟没有更新"),
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
    addDetailLine(tr("Note", "提示"), session.diagnosticHint);
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
  const description = byId("remote-install-description");
  const hostName = createElement("strong", undefined, alias);
  hostName.id = "remote-install-host-name";
  const version = createElement(
    "strong",
    undefined,
    latestState?.about.version ?? tr("the matching version", "对应版本"),
  );
  version.id = "remote-install-version";
  if (currentLocale() === "zh-CN") {
    description.replaceChildren(
      document.createTextNode("远程电脑 "),
      hostName,
      document.createTextNode(" 尚未准备好 Crewlight。请下载适用于该电脑的 "),
      version,
      document.createTextNode("，校验下载文件，完成安装后再重新连接。"),
    );
  } else {
    description.replaceChildren(
      document.createTextNode("Crewlight isn't ready on "),
      hostName,
      document.createTextNode(". Download "),
      version,
      document.createTextNode(
        " for that computer, verify the download, finish setup, then reconnect.",
      ),
    );
  }
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
  notice.setAttribute(
    "role",
    state.notice.tone === "error" ? "alert" : "status",
  );
  notice.setAttribute(
    "aria-live",
    state.notice.tone === "error" ? "assertive" : "polite",
  );
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
  const emptyCopy = byId("home-preview-empty").querySelector("p");
  if (emptyCopy) {
    emptyCopy.textContent = tr(
      "Start Crewlight and connect an agent to see live activity here.",
      "启动 Crewlight 并接入代理后，即可在这里查看实时状态。",
    );
  }
  setHidden("home-preview-empty", state.home.previewSessions.length > 0);
}

function doctorCheckLabel(id: string): string {
  const labels: Record<string, [string, string]> = {
    node: ["App engine", "应用运行环境"],
    pnpm: ["Build tools", "构建工具"],
    "cli-build": ["Crewlight files", "Crewlight 文件"],
    daemon: ["Crewlight startup", "Crewlight 启动"],
    "daemon-host": ["Local address", "本机地址"],
    "daemon-port": ["Connection port", "连接端口"],
    "cli-resolution": ["Crewlight command", "Crewlight 命令"],
    "capabilities-endpoint": ["Live status", "实时状态"],
    "task-titles": ["Task names", "任务名称"],
    "setup-claude-code": ["Claude Code setup", "Claude Code 接入"],
    "setup-codex": ["Codex setup", "Codex 接入"],
    "setup-codex-hooks": ["Codex permissions", "Codex 授权提醒"],
    notifier: ["Notifications", "通知"],
  };
  const label = labels[id] ?? ["Crewlight check", "Crewlight 检查"];
  return tr(label[0], label[1]);
}

function doctorStatusCopy(status: string): string {
  if (status === "ok") {
    return tr("Ready", "正常");
  }
  if (status === "skipped") {
    return tr("Not needed", "无需检查");
  }
  if (status === "warning") {
    return tr("Review recommended", "建议检查");
  }
  return tr("Needs attention", "需要处理");
}

function renderDoctor(state: DesktopViewModel): void {
  setText("doctor-summary", state.doctor.summary);

  const facts = byId("doctor-facts");
  const notificationLabel =
    state.settings.notifier === "os"
      ? tr("System notifications", "系统通知")
      : state.settings.notifier === "console"
        ? tr("Console", "控制台")
        : tr("Off", "关闭");
  const entries: Array<[string, string]> = [
    [tr("Version", "版本"), state.about.version],
    [tr("Platform", "平台"), state.doctor.platformLabel],
    [tr("Local address", "本机地址"), state.settings.host],
    [tr("Connection port", "连接端口"), String(state.settings.port)],
    [tr("Notifications", "通知"), notificationLabel],
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
        createElement("strong", "check-status", doctorCheckLabel(check.id)),
        createElement("p", "check-copy", doctorStatusCopy(check.status)),
      );

      const details = document.createElement("details");
      details.className = "check-details";
      details.append(
        createElement(
          "summary",
          undefined,
          tr("Technical details", "技术详情"),
        ),
        createElement("p", "check-copy", check.message),
      );
      if (check.action) {
        details.append(
          createElement(
            "p",
            "check-copy",
            `${tr("Suggested action", "建议操作")}: ${check.action}`,
          ),
        );
      }
      card.append(details);
      return card;
    }),
  );
}

function integrationButton(
  card: DesktopIntegrationCard,
  kind: "configure" | "setup" | "verification" | "select",
): HTMLButtonElement {
  const button = createElement(
    "button",
    kind === "configure" || kind === "select"
      ? "primary-button"
      : "secondary-button",
  ) as HTMLButtonElement;
  button.type = "button";
  button.dataset.integration = card.id;
  button.dataset.copyKind = kind;
  button.textContent =
    kind === "configure"
      ? (card.configureLabel ?? tr("Configure", "配置接入"))
      : kind === "setup"
        ? localized(card.copySetupLabel)
        : kind === "verification"
          ? localized(
              card.copyVerificationLabel ??
                tr("Copy verification command", "复制验证命令"),
            )
          : card.highlight
            ? tr("Selected", "已选择")
            : tr("Choose this path", "选择此方式");
  button.disabled =
    (kind === "configure" && card.configureDisabled === true) ||
    (kind === "verification" && !card.verificationCommand);
  return button;
}

function renderIntegrationCard(
  card: DesktopIntegrationCard,
  options: { includeSelectButton: boolean; onboarding?: boolean },
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
  if (card.configureLabel) {
    actions.append(integrationButton(card, "configure"));
  }
  if (!options.onboarding) {
    actions.append(integrationButton(card, "setup"));
    if (card.verificationCommand) {
      actions.append(integrationButton(card, "verification"));
    }
    if (options.includeSelectButton) {
      actions.append(integrationButton(card, "select"));
    }
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
          "The companion is ready while you work in another window.",
          "悬浮伴侣已就绪，可在其他窗口工作时随时查看。",
        )
      : tr(
          "Show the companion to keep live status nearby.",
          "显示悬浮伴侣，让实时状态随时可见。",
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
      tr("Top task", "首要任务"),
      state.companion.topSession ?? tr("No current task", "暂无任务"),
    ],
    [
      tr("Last update", "最近更新"),
      state.companion.updatedAt
        ? new Date(state.companion.updatedAt).toLocaleTimeString(
            currentLocale() === "zh-CN" ? "zh-CN" : "en",
            {
              hour: "2-digit",
              minute: "2-digit",
            },
          )
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
  const emptyCopy = byId("demo-empty").querySelector("p");
  if (emptyCopy) {
    emptyCopy.textContent = tr(
      "Run the demo to preview sample agent states.",
      "运行演示，预览几种代理状态。",
    );
  }
  setHidden("demo-empty", state.demo.sessions.length > 0);
}

function renderAccentOptions(state: DesktopViewModel): void {
  const root = byId("accent-options");
  const accents: Array<["teal" | "amber" | "azure", string]> = [
    ["teal", tr("Radar teal", "雷达青")],
    ["amber", tr("Signal amber", "信号琥珀")],
    ["azure", tr("Blue", "蓝色")],
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
  const emptyDetail = byId("remote-hosts-empty").querySelector("p");
  if (emptyDetail) {
    const marker = createElement("code", undefined, "# CrewlightRemote: yes");
    const sshConfig = createElement("code", undefined, "~/.ssh/config");
    emptyDetail.replaceChildren(
      document.createTextNode(tr("Add ", "请在 SSH 配置的主机条目前添加 ")),
      marker,
      document.createTextNode(tr(" above a Host entry in ", "，配置文件位于 ")),
      sshConfig,
      document.createTextNode(tr(".", "。")),
    );
  }

  const statusLabels: Record<
    DesktopViewModel["remote"]["hosts"][number]["tunnelState"],
    [string, string]
  > = {
    disconnected: ["Disconnected", "未连接"],
    connecting: ["Connecting", "连接中"],
    connected: ["Connected", "已连接"],
    error: ["Connection failed", "连接失败"],
  };

  list.replaceChildren(
    ...state.remote.hosts.map((host) => {
      const card = createElement("article", "remote-card");

      const header = createElement("div", "remote-header");
      header.append(createElement("h4", "remote-alias", host.alias));

      const status = createElement(
        "span",
        `remote-status ${host.tunnelState}`,
        tr(...statusLabels[host.tunnelState]),
      );
      header.append(status);

      card.append(header);

      if (host.hostname) {
        card.append(
          createElement(
            "p",
            "remote-detail",
            `${tr("Address", "地址")}: ${host.hostname}`,
          ),
        );
      }
      if (host.user) {
        card.append(
          createElement(
            "p",
            "remote-detail",
            `${tr("User", "用户")}: ${host.user}`,
          ),
        );
      }
      if (host.port) {
        card.append(
          createElement(
            "p",
            "remote-detail",
            `${tr("Port", "端口")}: ${host.port}`,
          ),
        );
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
              tr("Crewlight is ready", "Crewlight 已就绪"),
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
            tr("Crewlight needs setup.", "需要设置 Crewlight。"),
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
          "Crewlight brings live status, one-click agent setup, and the companion into one app.",
          "Crewlight 把实时状态、一键接入和悬浮伴侣整合在一个应用中。",
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
        "Choose Codex or Claude Code, then select Configure. Crewlight backs up your existing setup before changing it.",
        "选择 Codex 或 Claude Code，再点击“配置接入”。Crewlight 会先备份现有配置。",
      ),
    );
    const grid = createElement("div", "integration-grid");
    grid.append(
      ...state.integrations
        .filter((card) => card.id === "claude-code" || card.id === "codex")
        .map((card) =>
          renderIntegrationCard(card, {
            includeSelectButton: false,
            onboarding: true,
          }),
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
          "Go to Home without interrupting anything already running. Sample tasks stay on the Demo page.",
          "进入首页，不打断正在运行的任务；示例任务只显示在演示页面。",
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
        : tr(
            "The companion shows the same live status as Home.",
            "悬浮伴侣与首页显示相同的实时状态。",
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
  primary.disabled = current.id === "choose-integration" && !current.complete;
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
              ? tr("Start Crewlight", "启动 Crewlight")
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

type ConfigurableIntegration = Extract<
  PreferredIntegration,
  "claude-code" | "codex"
>;

function focusAfterIntegrationConfiguration(
  integration: ConfigurableIntegration,
  configured: boolean,
  fromOnboarding: boolean,
): void {
  window.requestAnimationFrame(() => {
    if (configured) {
      if (fromOnboarding && latestState?.onboarding.active) {
        byId<HTMLButtonElement>("onboarding-primary").focus();
        return;
      }

      const heading = document.querySelector<HTMLElement>(
        "#agents-section .card-heading h3",
      );
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
      return;
    }

    const containerSelector = fromOnboarding
      ? "#onboarding-body"
      : "#agent-cards";
    const replacement = document.querySelector<HTMLButtonElement>(
      `${containerSelector} button[data-integration="${integration}"][data-copy-kind="configure"]`,
    );
    if (replacement && !replacement.disabled) {
      replacement.focus();
      return;
    }

    const notice = byId("notice");
    if (!notice.hidden) {
      notice.tabIndex = -1;
      notice.focus();
    }
  });
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
    if (
      copyButton.dataset.copyKind === "configure" &&
      (card.id === "claude-code" || card.id === "codex")
    ) {
      const fromOnboarding = copyButton.closest("#onboarding-root") !== null;
      let configured = false;
      copyButton.disabled = true;
      copyButton.setAttribute("aria-busy", "true");
      try {
        configured = await window.crewlightDesktop.perform({
          type: "integration:configure",
          integration: card.id,
        });
      } finally {
        copyButton.removeAttribute("aria-busy");
        if (copyButton.isConnected) {
          copyButton.disabled = card.configureDisabled === true;
        }
        focusAfterIntegrationConfiguration(card.id, configured, fromOnboarding);
      }
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
