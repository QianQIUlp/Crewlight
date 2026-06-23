<p align="center">
  <img src="assets/readme/crewlight-mark.svg" width="112" alt="Crewlight pulse mark">
</p>

<h1 align="center">Crewlight</h1>

<p align="center"><strong>AI 编程代理的本地活动雷达。</strong></p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/QianQIUlp/Crewlight/releases/tag/v0.4.0"><img src="https://img.shields.io/badge/release-v0.4.0-0f766e" alt="Release v0.4.0"></a>
  <img src="https://img.shields.io/badge/desktop-Windows_x64-334155" alt="主要桌面平台：Windows x64">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/QianQIUlp/Crewlight" alt="MIT 许可证"></a>
  <a href="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml"><img src="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
</p>

Crewlight Desktop 是 v0.4.0 的主要用户入口。它把主控窗口、浮动 companion、
本地服务控制、demo 流程和集成配置收进一个本地优先的桌面应用里。

浏览器 dashboard 现在是次级开发者界面。CLI 则保留为高级和自动化入口。

## Windows 桌面端优先

### 主要下载项

- 便携桌面包：
  [`crewlight-v0.4.0-windows-x64-desktop.zip`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.4.0/crewlight-v0.4.0-windows-x64-desktop.zip)
- 未签名安装器：
  [`Crewlight-Setup-v0.4.0.exe`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.4.0/Crewlight-Setup-v0.4.0.exe)

### 首次体验流程

1. 下载并解压 `crewlight-v0.4.0-windows-x64-desktop.zip`
2. 双击 `Crewlight.exe`
3. 完成 onboarding：
   - Welcome
   - Start local service
   - Run demo
   - Show companion
   - Choose an integration path
4. 进入 `Home`，在桌面端完成本地服务、demo session 和 companion 的首轮体验

首次体验不需要手动开终端，也不需要先打开浏览器 dashboard。

## 产品界面分层

| 界面              | v0.4.0 中的角色                                    |
| ----------------- | -------------------------------------------------- |
| Crewlight Desktop | 主要用户发布界面                                   |
| 浮动 companion    | 由桌面端控制的次级常驻状态界面                     |
| 浏览器 dashboard  | 次级开发者 / 检查界面                              |
| CLI               | 高级配置、脚本、ingest、诊断和 standalone 构建入口 |

## 桌面端包含什么

- `Home` 指挥台：本地服务状态、实时计数和主要 CTA
- `Doctor`：启动、停止、重启、诊断和可复制摘要
- `Agents`：产品化的集成卡片
- `Companion`：显示、隐藏、模式、置顶和前置控制
- `Demo`：确定性的本地合成多代理场景
- `Appearance`：主题、强调色和密度
- `Settings`：host、port、notifier、onboarding 重放和本地自动启动偏好
- `About`：迁移说明与产品边界

## 支持的集成

| 集成                   | 等级                              | 当前边界                                                  |
| ---------------------- | --------------------------------- | --------------------------------------------------------- |
| Claude Code            | Precise                           | 使用文档化 lifecycle hooks；仅观察                        |
| Codex hooks            | Precise lifecycle                 | 观察文档化 session、prompt、tool、permission 和 stop 事件 |
| Codex `notify`         | Narrow official                   | 仅映射文档化的 `agent-turn-complete`                      |
| OpenCode               | Implemented, verification pending | 使用文档化本地 plugin 事件                                |
| Cursor                 | Manual / Experimental bridge      | 仅显式命令；不声明自动 Cursor 生命周期 hook 或私有 API    |
| Manual / custom ingest | Manual                            | 手动规范化事件与有限本地探针                              |

Crewlight 保持本地优先、只读。它不会自动批准权限，不控制 agent turn，不持久化
session 历史，也不依赖私有 API 抓取。

## 截图资源

真实桌面端截图会保存在：

- `assets/readme/crewlight-desktop-overview.png`
- `assets/readme/crewlight-desktop-agents.png`
- `assets/readme/crewlight-desktop-demo.png`
- `assets/readme/crewlight-desktop-companion.png`
- `assets/readme/companion-expanded-demo.png`

当前仓库环境是 headless，真实截图仍然需要在 GUI release gate 中采集。

## 浏览器 Dashboard

Dashboard 仍然存在于 loopback-only 的 daemon 端点上，但它不再是主要产品入口。
当你需要额外的浏览器视图来查看当前本地 session、配置片段和诊断时再使用它。

参见 [dashboard 指南](docs/dashboard.md)。

## 高级 CLI 用法

Standalone CLI 构建仍然保留：

- `crewlight-v0.4.0-linux-x64.tar.gz`
- `crewlight-v0.4.0-windows-x64.zip`

以下场景仍然适合使用 CLI：

- 生成 Claude Code、Codex、Cursor、OpenCode 的 setup 片段
- hook 与 notify ingest
- standalone daemon
- 脚本与 CI
- 手动规范化事件

示例：

```bash
crewlight setup claude-code --print
crewlight setup codex-hooks --print
crewlight daemon --dashboard --notifier none
crewlight demo multi-agent
crewlight status --json
```

## Breaking Rename

Crewlight 是 AgentPulse 在 v0.4.0 的重命名后续版本。

- `agentpulse` 已替换为 `crewlight`
- `AGENTPULSE_*` 已替换为 `CREWLIGHT_*`
- workspace package 现在使用 `@crewlight/*`
- 本地 setup 片段应通过 `crewlight setup ... --print` 重新生成

仓库重命名后：

```bash
git remote set-url origin https://github.com/QianQIUlp/Crewlight.git
```

## 产品边界

- 无云服务
- 不抓取私有 API
- 不自动批准权限
- 不保留 prompt、transcript 或 tool I/O
- v0.4.0 不持久化 session 历史

## 开发

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

桌面端开发：

```bash
pnpm desktop:dev
```

Windows 桌面打包：

```bash
pnpm package:desktop:portable
pnpm package:desktop:installer
```

相关文档：

- [无需 Node 安装](docs/install-without-node.md)
- [Companion surface 指南](docs/companion-surface.md)
- [Browser dashboard 指南](docs/dashboard.md)
- [产品定位](docs/product/positioning.md)
