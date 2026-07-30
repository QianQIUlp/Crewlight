export type Locale = "en" | "zh";

export const links = {
  repository: "https://github.com/QianQIUlp/Crewlight",
  latestRelease: "https://github.com/QianQIUlp/Crewlight/releases/latest",
  readme: "https://github.com/QianQIUlp/Crewlight#readme",
  readmeZh: "https://github.com/QianQIUlp/Crewlight/blob/main/README.zh-CN.md",
  architecture:
    "https://github.com/QianQIUlp/Crewlight/blob/main/docs/architecture.md",
  integrations:
    "https://github.com/QianQIUlp/Crewlight/blob/main/docs/integration-boundaries.md",
  license: "https://github.com/QianQIUlp/Crewlight/blob/main/LICENSE",
} as const;

export const copy = {
  en: {
    meta: {
      title: "Crewlight — Local activity radar for AI coding agents",
      description:
        "Crewlight keeps current AI coding-agent activity visible on your machine, so running, waiting, failed, and stale work is easy to spot.",
    },
    skipLink: "Skip to content",
    homeLabel: "Crewlight home",
    languageLabel: "中文",
    navigationLabel: "Primary navigation",
    navigation: [
      { label: "Attention radar", href: "#radar" },
      { label: "How it works", href: "#flow" },
      { label: "Surfaces", href: "#surfaces" },
      { label: "Boundaries", href: "#boundaries" },
    ],
    hero: {
      eyebrow: "LOCAL-FIRST · MULTI-AGENT-FIRST · OPEN SOURCE",
      titleLead: "Keep agents moving.",
      titleEmphasis: "Catch what needs you.",
      body: "Crewlight gathers current AI coding-agent status on your machine, then separates background progress from the sessions waiting for input, permission, or recovery.",
      primaryAction: "Inspect the source",
      secondaryAction: "See the attention model",
      releaseNote:
        "v0.5.0 is a stabilization candidate. The latest public release remains v0.4.0.",
      releaseAction: "View releases",
      demoLabel: "Illustrative local view",
      demoTitle: "Attention radar",
      demoLive: "DEMO · STATIC",
      metrics: [
        { label: "Active", value: "3", tone: "active" },
        { label: "Needs you", value: "1", tone: "attention" },
        { label: "Complete", value: "8", tone: "done" },
      ],
      sessionsLabel: "Current sessions",
      sessions: [
        {
          source: "Claude Code",
          task: "Refactor adapter tests",
          status: "Using tool",
          meta: "workspace/api · 2m",
          tone: "active",
        },
        {
          source: "Codex",
          task: "Review local package change",
          status: "Permission needed",
          meta: "workspace/app · now",
          tone: "attention",
        },
        {
          source: "Custom CLI",
          task: "Verify release bundle",
          status: "Completed",
          meta: "workspace/release · 4m",
          tone: "done",
        },
      ],
      footnote: "Current state only · no cloud account · read-only",
    },
    factsLabel: "Key product facts",
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
          "Complete prompts, transcripts, tool I/O, and raw payloads stay out of normalized output.",
      },
    ],
    radar: {
      eyebrow: "THE ATTENTION MODEL",
      title: "A small set of states. A much clearer workday.",
      intro:
        "Crewlight turns source-specific activity into a consistent local view, ordered by what deserves attention rather than by whichever agent spoke last.",
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
        "Every integration crosses an explicit normalization boundary before its status reaches the local daemon or a Crewlight surface.",
      steps: [
        {
          index: "01",
          label: "OBSERVE",
          title: "Receive explicit activity",
          body: "Documented hooks, official notifications, or manual commands produce bounded source signals.",
          note: "No private API scraping",
        },
        {
          index: "02",
          label: "NORMALIZE",
          title: "Keep only safe fields",
          body: "Source adapters retain status, identity, location, and short safe messages while dropping complete platform payloads.",
          note: "Allowlist at the adapter boundary",
        },
        {
          index: "03",
          label: "AGGREGATE",
          title: "Group current sessions locally",
          body: "The daemon validates events and groups them with Crewlight-owned, namespaced session keys.",
          note: "In memory · loopback by default",
        },
        {
          index: "04",
          label: "SURFACE",
          title: "Show what needs attention",
          body: "Desktop, companion, dashboard, and CLI turn current state into a readable, read-only view.",
          note: "Visibility without agent control",
        },
      ],
      architectureAction: "Read the architecture notes",
    },
    surfaces: {
      eyebrow: "ONE LOCAL CORE · FOUR SURFACES",
      title: "Stay close to the work without living in every terminal.",
      intro:
        "Crewlight uses a desktop-first hierarchy: a command center for local service controls, a companion when you only need a glance, and developer surfaces when you need detail.",
      cards: [
        {
          kind: "PRIMARY",
          title: "Crewlight Desktop",
          body: "Home, service controls, diagnostics, integration setup, demo sessions, appearance, and companion controls in one local application.",
          metric: "Command center",
          className: "desktop",
        },
        {
          kind: "GLANCEABLE",
          title: "Floating companion",
          body: "A compact, optional surface that keeps active, attention, failed, and stale counts nearby.",
          metric: "Always nearby",
          className: "companion",
        },
        {
          kind: "DEVELOPER",
          title: "Browser dashboard",
          body: "A secondary, loopback-only view for current sessions, setup snippets, and local diagnostics.",
          metric: "Read-only view",
          className: "dashboard",
        },
        {
          kind: "ADVANCED",
          title: "CLI",
          body: "Explicit setup snippets, ingest, status, doctor, demo, scripting, and standalone workflows.",
          metric: "Automation surface",
          className: "cli",
        },
      ],
    },
    integrations: {
      eyebrow: "EXPLICIT INTEGRATION BOUNDARIES",
      title: "Confidence is labeled, not implied.",
      intro:
        "Different tools expose different public integration points. Crewlight keeps those differences visible instead of claiming every adapter has the same coverage.",
      sourceLabel: "Source",
      levelLabel: "Current level",
      boundaryLabel: "Boundary",
      tableLabel: "Crewlight integration coverage and boundaries",
      rows: [
        {
          source: "Claude Code",
          level: "Precise",
          boundary: "Documented lifecycle hooks; observation only.",
          tone: "precise",
        },
        {
          source: "Codex hooks",
          level: "Precise lifecycle",
          boundary:
            "Documented session, prompt, tool, permission, and stop events.",
          tone: "precise",
        },
        {
          source: "Codex notify",
          level: "Narrow official",
          boundary: "The documented agent-turn-complete notification.",
          tone: "narrow",
        },
        {
          source: "OpenCode",
          level: "Verification pending",
          boundary:
            "Implemented local plugin events; end-to-end verification remains.",
          tone: "pending",
        },
        {
          source: "Cursor",
          level: "Manual / experimental",
          boundary:
            "Explicit commands only; no private automatic lifecycle claim.",
          tone: "manual",
        },
        {
          source: "Custom ingest",
          level: "Manual",
          boundary:
            "Caller-supplied normalized events and bounded local probes.",
          tone: "manual",
        },
      ],
      docsAction: "Inspect every integration boundary",
    },
    boundaries: {
      eyebrow: "THE HONEST BOUNDARY",
      title: "A radar, not an autopilot.",
      intro:
        "Crewlight is designed to help you notice current local activity. It deliberately stops before orchestration, surveillance, or cloud history.",
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
          body: "Complete prompts, transcripts, tool input/output, and raw platform payloads are not retained in normalized sessions.",
        },
        {
          title: "No hidden integration",
          body: "Public hooks, official notifications, plugins, and explicit commands replace private API scraping or screen watching.",
        },
      ],
      dataTitle: "Current state has a clear lifetime.",
      dataBody:
        "The local daemon keeps a bounded in-memory view of up to 1,000 sessions by default, and that session view disappears when the process stops. Only local interface preferences—such as theme, density, and companion visibility—are persisted.",
      previewNote:
        "Optional prompt preview can derive a short task title in hook memory. The complete prompt is not forwarded or retained.",
    },
    source: {
      eyebrow: "SOURCE AVAILABLE NOW",
      title: "See the boundary in code.",
      body: "Crewlight is built in public under the MIT license. Inspect the event schemas, adapter allowlists, desktop surfaces, tests, and release gates before you decide where it fits in your workflow.",
      primaryAction: "View Crewlight on GitHub",
      secondaryAction: "Read setup and docs",
      statusLabel: "PROJECT STATUS",
      statusValue: "v0.5.0 stabilization candidate",
      releaseLabel: "PUBLIC RELEASE",
      releaseValue: "v0.4.0 historical reference",
      platformLabel: "VERIFICATION",
      platformValue: "Linux x64 verified; other platform gates remain",
      licenseLabel: "LICENSE",
      licenseValue: "MIT",
    },
    footer: {
      tagline: "Local activity radar for AI coding agents.",
      status: "Local-first · read-only · built in public",
      navigationLabel: "Project links",
      source: "GitHub",
      architecture: "Architecture",
      integrations: "Integrations",
      license: "MIT license",
    },
  },
  zh: {
    meta: {
      title: "Crewlight — AI 编程代理的本地活动雷达",
      description:
        "Crewlight 在本机汇总 AI 编程代理的当前活动，让运行中、等待中、失败和疑似停滞的工作一眼可见。",
    },
    skipLink: "跳到主要内容",
    homeLabel: "Crewlight 首页",
    languageLabel: "EN",
    navigationLabel: "主导航",
    navigation: [
      { label: "注意力雷达", href: "#radar" },
      { label: "工作原理", href: "#flow" },
      { label: "产品界面", href: "#surfaces" },
      { label: "能力边界", href: "#boundaries" },
    ],
    hero: {
      eyebrow: "本地优先 · 多代理优先 · 开源",
      titleLead: "让代理继续工作，",
      titleEmphasis: "在需要时找到你。",
      body: "Crewlight 在本机汇总 AI 编程代理的当前状态，把后台进展与等待输入、等待授权或需要恢复的会话清晰分开。",
      primaryAction: "查看源代码",
      secondaryAction: "了解注意力模型",
      releaseNote:
        "v0.5.0 仍是稳定化候选版本；当前最新公开 Release 仍为 v0.4.0。",
      releaseAction: "查看 Releases",
      demoLabel: "本地视图示意",
      demoTitle: "注意力雷达",
      demoLive: "示例 · 静态",
      metrics: [
        { label: "活动中", value: "3", tone: "active" },
        { label: "需要你", value: "1", tone: "attention" },
        { label: "已完成", value: "8", tone: "done" },
      ],
      sessionsLabel: "当前会话",
      sessions: [
        {
          source: "Claude Code",
          task: "重构 adapter 测试",
          status: "正在使用工具",
          meta: "workspace/api · 2 分钟",
          tone: "active",
        },
        {
          source: "Codex",
          task: "检查本地包变更",
          status: "需要授权",
          meta: "workspace/app · 刚刚",
          tone: "attention",
        },
        {
          source: "自定义 CLI",
          task: "验证发布包",
          status: "已完成",
          meta: "workspace/release · 4 分钟",
          tone: "done",
        },
      ],
      footnote: "仅当前状态 · 无需云端账号 · 只读",
    },
    factsLabel: "产品要点",
    facts: [
      {
        label: "默认仅监听 LOOPBACK",
        value: "核心留在身边",
        detail: "除非你明确配置受信任的开发路径，daemon 只在本机监听。",
      },
      {
        label: "注意力优先",
        value: "突出信号，不制造噪音",
        detail: "输入、授权、失败、限流与疑似停滞会被提升到后台活动之前。",
      },
      {
        label: "白名单事件",
        value: "传递状态，不传递对话",
        detail:
          "完整 prompt、transcript、tool I/O 与原始 payload 不进入标准化输出。",
      },
    ],
    radar: {
      eyebrow: "注意力模型",
      title: "更少的状态，换来更清楚的工作日。",
      intro:
        "Crewlight 把来源各异的活动转成一致的本地视图，并按是否需要你关注排序，而不是看哪个代理最后说了话。",
      modes: [
        {
          index: "01",
          label: "工作中",
          title: "让它继续运行",
          body: "运行中和使用工具的会话保持可见，但不会把你从当前任务里拉走。",
          states: ["running", "using_tool"],
          tone: "active",
        },
        {
          index: "02",
          label: "需要你",
          title: "在正确时机介入",
          body: "输入和授权请求会变成明确的行动项，不再埋进多个终端标签页。",
          states: ["waiting_input", "waiting_permission"],
          tone: "attention",
        },
        {
          index: "03",
          label: "需要恢复",
          title: "尽早发现问题",
          body: "失败、限流以及长时间没有新信号的会话，会与健康工作清楚区分。",
          states: ["failed", "rate_limited", "stale"],
          tone: "error",
        },
      ],
    },
    flow: {
      eyebrow: "有边界的本地路径",
      title: "留下有用上下文，挡住敏感 payload。",
      intro:
        "每种集成都要经过明确的标准化边界，状态才会进入本地 daemon 或 Crewlight 界面。",
      steps: [
        {
          index: "01",
          label: "观察",
          title: "接收明确的活动",
          body: "文档化 hook、官方通知或手动命令产生有限、可解释的来源信号。",
          note: "不抓取私有 API",
        },
        {
          index: "02",
          label: "标准化",
          title: "只保留安全字段",
          body: "来源 adapter 保留状态、身份、位置和短安全消息，并丢弃完整平台 payload。",
          note: "在 adapter 边界执行白名单",
        },
        {
          index: "03",
          label: "聚合",
          title: "在本机整理当前会话",
          body: "Daemon 验证事件，并使用 Crewlight 自有、带命名空间的 session key 聚合。",
          note: "内存中 · 默认 loopback",
        },
        {
          index: "04",
          label: "呈现",
          title: "指出真正需要关注的工作",
          body: "Desktop、companion、dashboard 和 CLI 把当前状态变成清晰的只读视图。",
          note: "提供可见性，不控制代理",
        },
      ],
      architectureAction: "阅读架构说明",
    },
    surfaces: {
      eyebrow: "一个本地核心 · 四种界面",
      title: "靠近工作，但不必住在每个终端里。",
      intro:
        "Crewlight 采用桌面优先的界面层级：需要管理本地服务时打开主控，只想扫一眼时看 companion，需要细节时再进入开发者界面。",
      cards: [
        {
          kind: "主要入口",
          title: "Crewlight Desktop",
          body: "把 Home、本地服务控制、诊断、集成配置、Demo、外观设置和 companion 控制放进一个本地应用。",
          metric: "本地主控台",
          className: "desktop",
        },
        {
          kind: "快速扫视",
          title: "浮动 Companion",
          body: "可选的紧凑界面，让活动中、需要关注、失败和停滞计数始终留在附近。",
          metric: "常驻身边",
          className: "companion",
        },
        {
          kind: "开发者界面",
          title: "浏览器 Dashboard",
          body: "只在 loopback 提供的次级只读视图，用于查看当前会话、配置片段与本地诊断。",
          metric: "只读视图",
          className: "dashboard",
        },
        {
          kind: "高级入口",
          title: "CLI",
          body: "提供明确的 setup 片段、ingest、status、doctor、demo、脚本与 standalone 工作流。",
          metric: "自动化界面",
          className: "cli",
        },
      ],
    },
    integrations: {
      eyebrow: "明确标注集成边界",
      title: "把可信度写清楚，而不是暗示出来。",
      intro:
        "不同工具开放的公开集成点并不相同。Crewlight 会保留这些差异，不会假装所有 adapter 都有相同覆盖范围。",
      sourceLabel: "来源",
      levelLabel: "当前等级",
      boundaryLabel: "能力边界",
      tableLabel: "Crewlight 集成覆盖范围与能力边界",
      rows: [
        {
          source: "Claude Code",
          level: "精确",
          boundary: "使用文档化 lifecycle hooks；仅观察。",
          tone: "precise",
        },
        {
          source: "Codex hooks",
          level: "精确生命周期",
          boundary:
            "观察文档化 session、prompt、tool、permission 和 stop 事件。",
          tone: "precise",
        },
        {
          source: "Codex notify",
          level: "窄范围官方能力",
          boundary: "仅使用文档化的 agent-turn-complete 通知。",
          tone: "narrow",
        },
        {
          source: "OpenCode",
          level: "待验证",
          boundary: "已实现本地 plugin 事件；端到端验证仍未完成。",
          tone: "pending",
        },
        {
          source: "Cursor",
          level: "手动 / 实验性",
          boundary: "仅显式命令；不声明私有或自动生命周期观察。",
          tone: "manual",
        },
        {
          source: "自定义 ingest",
          level: "手动",
          boundary: "调用方提供标准化事件和有限的本地探针。",
          tone: "manual",
        },
      ],
      docsAction: "检查每项集成边界",
    },
    boundaries: {
      eyebrow: "诚实边界",
      title: "它是雷达，不是自动驾驶。",
      intro:
        "Crewlight 只帮助你注意本机当前活动，并刻意停在编排、监视和云端历史之前。",
      items: [
        {
          title: "不是云服务",
          body: "代理状态不会发送到 Crewlight 托管的账号或云端观测后端。",
        },
        {
          title: "不控制代理",
          body: "Crewlight 不会自动批准权限、回答 prompt 或控制 agent turn。",
        },
        {
          title: "不保存对话档案",
          body: "完整 prompt、transcript、tool I/O 与原始平台 payload 不会保留在标准化会话中。",
        },
        {
          title: "不使用隐藏集成",
          body: "公开 hook、官方通知、plugin 和显式命令取代私有 API 抓取或屏幕监视。",
        },
      ],
      dataTitle: "当前状态有明确的生命周期。",
      dataBody:
        "本地 daemon 默认最多保留 1,000 个内存会话，进程停止后这些会话状态就会消失。只有主题、密度、companion 可见性等本地界面偏好会被持久化。",
      previewNote:
        "可选的 prompt preview 可以在 hook 内存中派生短任务标题；完整 prompt 不会被转发或保留。",
    },
    source: {
      eyebrow: "源代码现已公开",
      title: "从代码里检查边界。",
      body: "Crewlight 以 MIT 许可证公开开发。在决定它是否适合你的工作流之前，可以先检查事件 schema、adapter 白名单、桌面界面、测试与发布门槛。",
      primaryAction: "在 GitHub 查看 Crewlight",
      secondaryAction: "阅读配置与文档",
      statusLabel: "项目状态",
      statusValue: "v0.5.0 稳定化候选版本",
      releaseLabel: "公开 RELEASE",
      releaseValue: "v0.4.0 历史参考构建",
      platformLabel: "验证状态",
      platformValue: "Linux x64 已验证；其他平台仍有门槛",
      licenseLabel: "许可证",
      licenseValue: "MIT",
    },
    footer: {
      tagline: "AI 编程代理的本地活动雷达。",
      status: "本地优先 · 只读 · 公开开发",
      navigationLabel: "项目链接",
      source: "GitHub",
      architecture: "架构",
      integrations: "集成",
      license: "MIT 许可证",
    },
  },
} as const;
