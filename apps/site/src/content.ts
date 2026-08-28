export type Locale = "en" | "zh";

export const links = {
  repository: "https://github.com/QianQIUlp/Crewlight",
  latestRelease: "https://github.com/QianQIUlp/Crewlight/releases/latest",
  v050Release: "https://github.com/QianQIUlp/Crewlight/releases/tag/v0.5.0",
  releasePolicy:
    "https://github.com/QianQIUlp/Crewlight/blob/main/release-policy.json",
  readme: "https://github.com/QianQIUlp/Crewlight#readme",
  readmeZh: "https://github.com/QianQIUlp/Crewlight/blob/main/README.zh-CN.md",
  architecture:
    "https://github.com/QianQIUlp/Crewlight/blob/main/docs/architecture.md",
  integrations:
    "https://github.com/QianQIUlp/Crewlight/blob/main/docs/integration-boundaries.md",
  license: "https://github.com/QianQIUlp/Crewlight/blob/main/LICENSE",
} as const;

const shared = {
  facts: [
    {
      label: "LOOPBACK BY DEFAULT",
      value: "The core stays close",
      detail:
        "The daemon listens locally unless you deliberately configure a trusted development path.",
    },
    {
      label: "ATTENTION FIRST",
      value: "Signals over noise",
      detail:
        "Input, permission, failure, rate limits, and staleness rise above background activity.",
    },
    {
      label: "ALLOWLISTED EVENTS",
      value: "Status, not transcripts",
      detail:
        "Prompts, transcripts, tool I/O, and raw payloads stay out of normalized output.",
    },
  ],
  radar: {
    eyebrow: "THE ATTENTION MODEL",
    title: "A small set of states. A much clearer workday.",
    intro:
      "One Attention Engine orders concurrent sessions by what deserves attention rather than by whichever agent spoke last.",
    modes: [
      {
        index: "01",
        label: "WORKING",
        title: "Let it run",
        body: "Running and tool-using sessions stay visible without pulling you away from the task in front of you.",
        states: ["running", "using_tool"],
        tone: "active",
      },
      {
        index: "02",
        label: "NEEDS YOU",
        title: "Step in at the right moment",
        body: "Requests for input or permission become explicit action items instead of disappearing into terminal tabs.",
        states: ["waiting_input", "waiting_permission"],
        tone: "attention",
      },
      {
        index: "03",
        label: "RECOVER",
        title: "Catch trouble early",
        body: "Failures, rate limits, and sessions with no recent signal stay easy to distinguish from healthy work.",
        states: ["failed", "rate_limited", "stale"],
        tone: "error",
      },
    ],
  },
  flow: {
    eyebrow: "A BOUNDED LOCAL PATH",
    title: "Useful context in. Sensitive payloads out.",
    intro:
      "Documented hooks and official notifications cross an explicit allowlist before status reaches the local daemon or a Crewlight surface.",
    steps: [
      {
        index: "01",
        label: "OBSERVE",
        title: "Receive explicit activity",
        body: "Claude Code hooks, Codex Hooks/notify, or manual commands produce bounded source signals.",
        note: "No private API scraping",
      },
      {
        index: "02",
        label: "NORMALIZE",
        title: "Keep only safe fields",
        body: "Adapters retain status, identity, location, and short safe messages while dropping complete platform payloads.",
        note: "Allowlist at the adapter boundary",
      },
      {
        index: "03",
        label: "AGGREGATE",
        title: "Group current sessions locally",
        body: "The daemon validates events and groups them with namespaced Crewlight session keys.",
        note: "In memory · loopback by default",
      },
      {
        index: "04",
        label: "SURFACE",
        title: "Show what needs attention",
        body: "Desktop, Companion, dashboard, and CLI turn current state into a readable, read-only view.",
        note: "Visibility without agent control",
      },
    ],
    architectureAction: "Read the architecture notes",
  },
  surfaces: {
    eyebrow: "ONE LOCAL CORE · FOUR SURFACES",
    title: "Stay close to the work without living in every terminal.",
    intro:
      "Desktop is the Windows-first command center; Companion and the loopback dashboard remain compact local views, and CLI is the advanced surface.",
    cards: [
      {
        kind: "PRIMARY",
        title: "Crewlight Desktop",
        body: "Home, Connect, Troubleshooting, Settings, and the complete visible Inbox in one local application.",
        metric: "Command center",
        className: "desktop",
      },
      {
        kind: "GLANCEABLE",
        title: "Floating Companion",
        body: "A compact optional surface for needs-action, error, stale, active, and ready counts.",
        metric: "Always nearby",
        className: "companion",
      },
      {
        kind: "DEVELOPER",
        title: "Browser dashboard",
        body: "A secondary loopback-only view for current sessions and diagnostics.",
        metric: "Read-only view",
        className: "dashboard",
      },
      {
        kind: "ADVANCED",
        title: "CLI",
        body: "Explicit setup snippets, ingest, status, doctor, and standalone workflows.",
        metric: "Automation surface",
        className: "cli",
      },
    ],
  },
  boundaries: {
    eyebrow: "THE HONEST BOUNDARY",
    title: "An Inbox, not an autopilot.",
    intro:
      "Crewlight helps you notice current local activity and deliberately stops before orchestration, surveillance, or cloud history.",
    items: [
      {
        title: "No cloud service",
        body: "Agent state is not sent to a Crewlight-hosted account or observability backend.",
      },
      {
        title: "No agent control",
        body: "Crewlight does not approve permissions, answer prompts, or steer agent turns.",
      },
      {
        title: "No transcript archive",
        body: "Prompts, transcripts, reasoning, tool input/output, and raw payloads are not retained in normalized sessions.",
      },
      {
        title: "No hidden integration",
        body: "Public hooks, official notifications, and explicit commands replace private API scraping or screen watching.",
      },
    ],
    dataTitle: "Current state has a clear lifetime.",
    dataBody:
      "The daemon keeps a bounded in-memory view of up to 1,000 sessions and 100,000 stable event IDs. The view disappears when the process stops; only bounded local interface preferences persist.",
    previewNote:
      "Prompt Preview is off by default and never forwards or retains the complete prompt.",
  },
} as const;

const integrations = {
  eyebrow: "EXPLICIT INTEGRATION BOUNDARIES",
  title: "Confidence is labeled, not implied.",
  intro:
    "Claude Code and Codex are the formal v0.5 paths. Other bridges remain collapsed experimental surfaces.",
  sourceLabel: "Source",
  levelLabel: "Current level",
  boundaryLabel: "Boundary",
  tableLabel: "Crewlight integration coverage and boundaries",
  rows: [
    {
      source: "Claude Code",
      level: "Supported path",
      boundary: "Documented lifecycle hooks; observation only.",
      tone: "precise",
    },
    {
      source: "Codex Hooks",
      level: "Supported path",
      boundary: "Documented lifecycle hooks after /hooks trust review.",
      tone: "precise",
    },
    {
      source: "Codex notify",
      level: "Compatibility",
      boundary:
        "Documented turn-complete input; not the full lifecycle hook path.",
      tone: "narrow",
    },
    {
      source: "OpenCode / Cursor / Manual",
      level: "Experimental",
      boundary: "Collapsed manual bridges; no supported Windows contract.",
      tone: "manual",
    },
  ],
  docsAction: "Inspect integration boundaries",
} as const;

function makeCopy(language: "en" | "zh") {
  const zh = language === "zh";
  return {
    meta: {
      title: zh
        ? "Crewlight — 本地 Agent Attention Inbox"
        : "Crewlight — Local Agent Attention Inbox",
      description: zh
        ? "在本机集中查看并行 Claude Code 与 Codex 回合的需要关注状态。"
        : "See concurrent Claude Code and Codex turns that need attention on your machine.",
    },
    skipLink: zh ? "跳到主要内容" : "Skip to content",
    homeLabel: zh ? "Crewlight 首页" : "Crewlight home",
    languageLabel: zh ? "EN" : "中文",
    navigationLabel: zh ? "主导航" : "Primary navigation",
    navigation: zh
      ? [
          { label: "注意力 Inbox", href: "#radar" },
          { label: "工作原理", href: "#flow" },
          { label: "界面", href: "#surfaces" },
          { label: "边界", href: "#boundaries" },
        ]
      : [
          { label: "Attention Inbox", href: "#radar" },
          { label: "How it works", href: "#flow" },
          { label: "Surfaces", href: "#surfaces" },
          { label: "Boundaries", href: "#boundaries" },
        ],
    hero: {
      eyebrow: zh
        ? "本地优先 · 多 Agent · 开源"
        : "LOCAL-FIRST · MULTI-AGENT · OPEN SOURCE",
      titleLead: zh ? "让 Agent 继续工作，" : "Keep agents moving.",
      titleEmphasis: zh ? "在需要时找到你。" : "Catch what needs you.",
      body: zh
        ? "Crewlight 在本机收集 Claude Code 与 Codex 的安全状态，把等待输入、权限、失败、限流和过期信号从后台活动中分离出来。"
        : "Crewlight gathers safe Claude Code and Codex status locally, separating waiting input, permission, failure, rate-limit, and stale signals from background activity.",
      primaryAction: zh ? "查看源码" : "Inspect the source",
      secondaryAction: zh ? "查看注意力模型" : "See the attention model",
      releaseNote: zh
        ? "v0.5.0 Windows-first 候选预发布现已可用。"
        : "The v0.5.0 Windows-first candidate prerelease is now available.",
      releaseAction: zh ? "查看预发布" : "View prerelease",
      demoLabel: zh ? "本地视图示意" : "Illustrative local view",
      demoTitle: zh ? "Attention Inbox" : "Attention Inbox",
      demoLive: zh ? "示例 · 静态" : "DEMO · STATIC",
      metrics: zh
        ? [
            { label: "活动中", value: "3", tone: "active" },
            { label: "需要你", value: "1", tone: "attention" },
            { label: "Ready", value: "8", tone: "done" },
          ]
        : [
            { label: "Active", value: "3", tone: "active" },
            { label: "Needs you", value: "1", tone: "attention" },
            { label: "Ready", value: "8", tone: "done" },
          ],
      sessionsLabel: zh ? "当前回合" : "Current turns",
      sessions: zh
        ? [
            {
              source: "Claude Code",
              task: "等待权限",
              status: "需要检查",
              meta: "workspace/api · 现在",
              tone: "attention",
            },
            {
              source: "Codex",
              task: "运行工具",
              status: "活动中",
              meta: "workspace/app · 2 分钟",
              tone: "active",
            },
            {
              source: "Codex",
              task: "本轮已结束",
              status: "Ready",
              meta: "workspace/release · 4 分钟",
              tone: "done",
            },
          ]
        : [
            {
              source: "Claude Code",
              task: "Permission review",
              status: "Needs you",
              meta: "workspace/api · now",
              tone: "attention",
            },
            {
              source: "Codex",
              task: "Using a tool",
              status: "Active",
              meta: "workspace/app · 2m",
              tone: "active",
            },
            {
              source: "Codex",
              task: "Turn finished",
              status: "Ready",
              meta: "workspace/release · 4m",
              tone: "done",
            },
          ],
      footnote: zh
        ? "仅当前状态 · 无云账户 · 只读"
        : "Current state only · no cloud account · read-only",
    },
    factsLabel: zh ? "产品要点" : "Key product facts",
    facts: zh
      ? shared.facts.map((fact) => ({
          ...fact,
          label: fact.label,
          value: fact.value,
          detail: fact.detail,
        }))
      : shared.facts,
    radar: zh
      ? {
          ...shared.radar,
          eyebrow: "注意力模型",
          title: "少量状态，更清晰的工作日",
          intro: "一个 Attention Engine 按照需要关注的程度排序并行回合。",
        }
      : shared.radar,
    flow: zh
      ? {
          ...shared.flow,
          eyebrow: "有边界的本地路径",
          title: "有用上下文进入，敏感载荷留在外面。",
          intro:
            "公开 Hooks 和官方通知先经过 allowlist，再进入本地 daemon 或 Crewlight 界面。",
          architectureAction: "阅读架构说明",
        }
      : shared.flow,
    surfaces: zh
      ? {
          ...shared.surfaces,
          eyebrow: "一个本地核心 · 四个界面",
          title: "靠近工作，不必守着每个终端。",
          intro:
            "Desktop 是 Windows-first 指挥台；Companion、loopback Dashboard 与 CLI 是辅助界面。",
        }
      : shared.surfaces,
    integrations: zh
      ? {
          ...integrations,
          eyebrow: "明确的集成边界",
          title: "标记置信度，不做暗示",
          intro:
            "Claude Code 与 Codex 是 v0.5 正式路径，其余桥接保持 Experimental 折叠。",
          sourceLabel: "来源",
          levelLabel: "等级",
          boundaryLabel: "边界",
          tableLabel: "Crewlight 集成覆盖与边界",
          docsAction: "查看集成边界",
        }
      : integrations,
    boundaries: zh
      ? {
          ...shared.boundaries,
          eyebrow: "诚实边界",
          title: "是 Inbox，不是自动驾驶",
          intro:
            "Crewlight 帮你注意当前本地活动，并在编排、监控和云历史之前停止。",
          dataTitle: "当前状态有明确生命周期",
          dataBody:
            "daemon 默认在内存中保留最多 1,000 个 session 与 100,000 个稳定事件 ID；进程停止后视图消失，只持久化有限的本地界面偏好。",
          previewNote: "Prompt Preview 默认关闭，不转发或保存完整 prompt。",
        }
      : shared.boundaries,
    source: {
      eyebrow: zh ? "源码现已公开" : "SOURCE AVAILABLE NOW",
      title: zh ? "在代码中查看边界。" : "See the boundary in code.",
      body: zh
        ? "Crewlight 以 MIT 许可证公开构建。你可以在决定是否使用前检查 schema、allowlist、Desktop 界面、测试和发布门禁。"
        : "Crewlight is built in public under the MIT license. Inspect the schemas, allowlists, Desktop surfaces, tests, and release gates before deciding where it fits.",
      primaryAction: zh ? "在 GitHub 查看" : "View Crewlight on GitHub",
      secondaryAction: zh ? "阅读设置与文档" : "Read setup and docs",
      statusLabel: zh ? "项目状态" : "PROJECT STATUS",
      statusValue: zh
        ? "v0.5.0 Windows-first 候选"
        : "v0.5.0 Windows-first candidate",
      releaseLabel: zh ? "公开发布" : "PUBLIC RELEASE",
      releaseValue: zh
        ? "v0.5.0 Windows 候选预发布"
        : "v0.5.0 Windows candidate prerelease",
      platformLabel: zh ? "平台策略" : "PLATFORM POLICY",
      platformValue: zh
        ? "Windows Supported/Unsigned；Linux/macOS 仅源码验证"
        : "Windows Supported/Unsigned; Linux/macOS source validation only",
      licenseLabel: zh ? "许可证" : "LICENSE",
      licenseValue: "MIT",
    },
    footer: {
      tagline: zh
        ? "面向并行编码工作的本地 Agent Attention Inbox。"
        : "Local Agent Attention Inbox for concurrent coding work.",
      status: zh
        ? "本地优先 · 只读 · 公开构建"
        : "Local-first · read-only · built in public",
      navigationLabel: zh ? "项目链接" : "Project links",
      source: "GitHub",
      architecture: zh ? "架构" : "Architecture",
      integrations: zh ? "集成" : "Integrations",
      license: zh ? "MIT 许可证" : "MIT license",
    },
  };
}

export const copy = {
  en: makeCopy("en"),
  zh: makeCopy("zh"),
} as const;
