<p align="center">
  <img src="assets/readme/agentpulse-mark.svg" width="112" alt="AgentPulse pulse mark">
</p>

<h1 align="center">AgentPulse</h1>

<p align="center"><strong>Universal activity monitor for AI coding agents.</strong></p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/QianQIUlp/AgentPulse/releases/tag/v0.3.0"><img src="https://img.shields.io/badge/published_preview-v0.3.0-7c3aed" alt="Published preview v0.3.0"></a>
  <img src="https://img.shields.io/badge/platform-Linux_x64_%7C_Windows_x64-334155" alt="支持平台：Linux x64 和 Windows x64">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/QianQIUlp/AgentPulse" alt="MIT 许可证"></a>
  <a href="https://github.com/QianQIUlp/AgentPulse/actions/workflows/ci.yml"><img src="https://github.com/QianQIUlp/AgentPulse/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
</p>

AgentPulse 是一个本地活动中心：它将受支持的 AI 编程代理事件规范化到统一的当前状态视图，并提供安全通知、CLI 检查和可选的只读 dashboard。

<p align="center">
  <img src="assets/readme/agentpulse-flow.svg" width="100%" alt="AgentPulse 将有限的代理集成事件经过白名单 adapter 和本地 daemon 转换为只读状态输出">
</p>

## 功能概览

- **统一的本地活动视图：** 将受支持的代理生命周期事件聚合为由 AgentPulse
  管理、带命名空间的 session。
- **状态优先的 dashboard：** 查看当前工作、需要操作的状态、失败、可能停滞的活动、配置片段和基础 doctor 输出。
- **灵活的通知方式：** 可选择 console、OS 或 no-op 输出；通知失败不会影响事件接收。
- **安全的 adapter 边界：** 仅转换白名单内的状态、身份、位置和简短安全消息字段。
- **非阻塞集成：** 输入格式错误或 daemon 不可达时安全降级，避免中断 hook 与 notify 工作流。
- **Standalone Preview 构建：** 支持的 Linux x64 和 Windows x64
  构建无需安装 Node.js、npm 或 pnpm。

浏览器 dashboard 默认不启用，只读且强制限制在 loopback；它只反映当前 daemon
进程内存中的状态。

## 支持的集成与集成等级

AgentPulse 明确区分已验证接口、实验性路径和有限回退能力：

| 集成                     | 等级                              | 当前边界                                                                  |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| Claude Code              | Precise                           | 使用文档化生命周期 hooks；仅观察                                          |
| Codex hooks              | Precise lifecycle                 | 用户确认信任后，观察文档化 session、prompt、tool、permission 和 stop 事件 |
| Codex `notify`           | Narrow official                   | 仅映射文档化的 `agent-turn-complete` 通知                                 |
| OpenCode                 | Implemented, verification pending | 使用文档化本地 plugin 事件；尚未标记为 supported                          |
| Codex Desktop            | Experimental                      | 通过显式 desktop surface 复用 Codex hooks；仍待真实环境验证               |
| Antigravity              | Research-only                     | 仅提供经过清理的手动 probe 脚手架，不是受支持 adapter                     |
| Generic CLI wrapper      | Best-effort                       | 只能观察 `agentpulse run` 启动的进程                                      |
| Manual normalized events | Manual                            | 调用方通过 `agentpulse emit` 显式提交事件                                 |

Codex hooks 仅用于观察。AgentPulse 不返回 permission 决策、上下文、更新后的
tool input 或 turn-control 输出。

精确事件和数据契约见
[集成边界文档](docs/integration-boundaries.md)。

## 快速开始

推荐用户使用 standalone
[AgentPulse v0.3.0 Preview](https://github.com/QianQIUlp/AgentPulse/releases/tag/v0.3.0)
构建：

| 平台        | v0.3.0 Preview 状态                               |
| ----------- | ------------------------------------------------- |
| Linux x64   | 受支持，并通过 CI standalone smoke test 验证      |
| Windows x64 | 受支持，并通过 CI standalone smoke test 验证      |
| macOS       | 计划中 / 未验证；当前不声明存在受支持的二进制文件 |

1. 下载压缩包和对应的 checksum：

   - Linux：
     [`agentpulse-v0.3.0-linux-x64.tar.gz`](https://github.com/QianQIUlp/AgentPulse/releases/download/v0.3.0/agentpulse-v0.3.0-linux-x64.tar.gz)
     与
     [`agentpulse-v0.3.0-linux-x64.tar.gz.sha256`](https://github.com/QianQIUlp/AgentPulse/releases/download/v0.3.0/agentpulse-v0.3.0-linux-x64.tar.gz.sha256)
   - Windows：
     [`agentpulse-v0.3.0-windows-x64.zip`](https://github.com/QianQIUlp/AgentPulse/releases/download/v0.3.0/agentpulse-v0.3.0-windows-x64.zip)
     与
     [`agentpulse-v0.3.0-windows-x64.zip.sha256`](https://github.com/QianQIUlp/AgentPulse/releases/download/v0.3.0/agentpulse-v0.3.0-windows-x64.zip.sha256)

2. 校验并解压。

   Linux：

   ```bash
   sha256sum --check agentpulse-v0.3.0-linux-x64.tar.gz.sha256
   tar -xzf agentpulse-v0.3.0-linux-x64.tar.gz
   cd agentpulse-v0.3.0-linux-x64
   ```

   Windows PowerShell：

   ```powershell
   $expected = (Get-Content .\agentpulse-v0.3.0-windows-x64.zip.sha256).Split()[0]
   $actual = (Get-FileHash .\agentpulse-v0.3.0-windows-x64.zip -Algorithm SHA256).Hash
   if ($actual.ToLower() -ne $expected.ToLower()) { throw "Checksum mismatch" }
   Expand-Archive .\agentpulse-v0.3.0-windows-x64.zip -DestinationPath .\agentpulse-v0.3.0-windows-x64
   Set-Location .\agentpulse-v0.3.0-windows-x64
   ```

3. 启动 daemon 和可选 dashboard：

   ```bash
   ./agentpulse daemon --dashboard
   ```

   Windows 使用：

   ```powershell
   .\agentpulse.exe daemon --dashboard
   ```

4. 打开命令输出的本地地址，通常是
   `http://127.0.0.1:3768/dashboard`，然后检查安装：

   ```bash
   ./agentpulse doctor
   ./agentpulse status
   ```

Standalone 模式下，`doctor` 会说明无需执行源码构建检查。压缩包中的
`BUILD-INFO.txt` 记录构建运行时、commit、平台和架构。更多信息见
[无需 Node 安装](docs/install-without-node.md)和
[dashboard 指南](docs/dashboard.md)。开发 experimental Electron 状态窗口时，
请参考 [companion surface 指南](docs/companion-surface.md)。

下文命令假设 `agentpulse` 已加入 `PATH`。直接从 Linux 解压目录运行时，请替换为
`./agentpulse`；Windows 使用 `.\agentpulse.exe`。

## 平台配置

AgentPulse 只打印可检查、可合并的配置片段：

```bash
agentpulse setup claude-code --print
agentpulse setup codex --print
agentpulse setup codex-hooks --print
agentpulse setup opencode --print
```

这些命令不会读取或修改用户配置。默认情况下，生成的命令包含当前 standalone
二进制路径，或源码模式下的 Node.js 与 CLI 路径。只有在明确选择 `PATH`
模式时才使用 `--binary agentpulse`。

请按平台文档完成合并与验证：

- [Claude Code 配置](docs/setup-claude-code.md)
- [Codex notify 配置](docs/setup-codex.md)
- [Codex hooks 配置](docs/setup-codex-hooks.md)
- [OpenCode plugin MVP](docs/opencode.md)

Hook 风格的 Codex 与 OpenCode ingest 在输入错误或 daemon 不可达时保持静默、非阻塞。

### 日常 CLI

启动 daemon 时选择 notifier：

```bash
agentpulse daemon --notifier console
agentpulse daemon --notifier os
agentpulse daemon --notifier none
```

默认值为 `console`。Linux 的 OS 通知需要图形会话和 `notify-send`；通知失败不会中断事件接收。

查看当前内存 session，或使用 best-effort adapter 包装单个命令：

```bash
agentpulse status
agentpulse status --json
agentpulse run --source generic-cli -- npm test
```

Wrapper 会保留原命令的退出结果。手动调用方可以通过 `agentpulse emit`
提交规范化事件。

## 开发者配置

源码构建要求 Node.js 22 或更高版本，以及 pnpm 10.11.0：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
cd packages/cli
npm link
cd ../..
```

运行仓库校验：

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

无需全局 link 的本地运行方式：

```bash
node packages/cli/dist/index.js
```

Node SEA bundle 只用于特定 release 流程：

```bash
pnpm build:standalone
pnpm smoke:standalone
```

## 架构与安全

平台 adapter 将源 payload 转换为白名单化的 `AgentEventInput`。Daemon
规范化这些输入、派生 AgentPulse 自有的 `sessionKey`、在内存中维护当前
session，并向选定 notifier 和只读状态界面提供输出。

- `sessionId` 是平台可选提供的原始标识。
- `sessionKey` 由 AgentPulse 管理、带命名空间，并用于稳定聚合；外部 ID
  不会直接作为内部 key。
- 完整平台 payload、raw event、prompt、transcript、tool input/output 和
  Codex `input-messages` 不会转发到规范化事件、session、notifier 输出、日志或
  dashboard 响应。
- Dashboard 只读且仅在使用 `--dashboard` 时存在。它拒绝除 `127.0.0.1` 与
  `::1` 之外的所有 host，返回 `Cache-Control: no-store`，并使用普通 HTTP
  polling，而不是 SSE 或 WebSocket。
- Daemon 默认监听 `127.0.0.1:3768`。由于 HTTP API 没有认证，更宽的 daemon
  绑定仅适用于可信开发环境。
- Session 只存在于 daemon 进程生命周期内；没有持久化、历史恢复或 session
  garbage collection。
- Setup 命令只打印片段；AgentPulse 不会自动修改 Claude、Codex 或 OpenCode
  用户配置。
- 核心集成不依赖私有 API 逆向、OCR、屏幕抓取、窗口监视、模拟输入或隐藏平台行为。

参见[架构](docs/architecture.md)、
[集成边界](docs/integration-boundaries.md)和
[故障排查](docs/troubleshooting.md)。

## 已知限制

- OpenCode 已实现，但仍需真实本地验证后才能标记为 supported。
- Codex Desktop 仍为 experimental。
- Antigravity 仍为 research-only，不是稳定 adapter 或配置路径。
- macOS 没有受支持的 v0.3.0 standalone 构建。
- Dashboard 不提供持久化、认证、远程访问、历史恢复、SSE/WebSocket
  streaming 或状态修改控制。
- Development-only Electron companion prototype 不是桌面安装器或 v0.3.0
  release artifact，也不提供 autostart。
- AgentPulse 当前不包含 Cursor adapter、VS Code extension、持久化、session
  cleanup、硬件输出或自动配置修改。

这些边界是 v0.3.0 Preview 的明确范围，不应被理解为对稳定 API、installer
或成熟桌面产品的声明。

## 文档与许可证

- [Dashboard 指南](docs/dashboard.md)
- [Companion surface 指南](docs/companion-surface.md)
- [架构](docs/architecture.md)
- [贡献指南](CONTRIBUTING.zh-CN.md)
- [English contributing guide](CONTRIBUTING.md)

AgentPulse 使用 [MIT License](LICENSE)。
