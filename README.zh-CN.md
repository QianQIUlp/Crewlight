<p align="center">
  <img src="assets/readme/crewlight-mark.svg" width="112" alt="Crewlight pulse mark">
</p>

<h1 align="center">Crewlight</h1>

<p align="center"><strong>面向并行编码工作的本地 Agent Attention Inbox。</strong></p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

> v0.5.0 是 Windows-first 候选版本。Windows x64 计划标记为
> Supported（未签名）；Linux/macOS 仅保留源码验证，不发布 v0.5 原生
> 二进制；Remote 为 Beta。已在测试用的 Windows Server 2025 主机上记录
> 打包 Portable 验收。下载见
> [v0.5.0 GitHub prerelease](https://github.com/QianQIUlp/Crewlight/releases/tag/v0.5.0)。
> v0.4.0 是 2026-06-23 发布的 archived prototype。

Crewlight 用一个本地只读 Inbox 回答三个问题：哪个 Agent 需要我、哪个仍在
运行、哪个出了问题。正式集成只有 Claude Code 与 Codex Hooks；已有 Codex
`notify` 作为完成事件兼容入口，不是完整的 lifecycle hooks 路径。

## 产品合同

- 不控制 Agent、不批准权限、不读取 worktree/diff/PR、不提供云历史。
- 默认关闭 Prompt Preview；不保存 prompt、transcript、reasoning、tool I/O
  或 raw payload。
- Attention 排序固定为：`needs_action > error > stale > active > ready > hidden`。
- `completed` 只表示本轮结束、等待检查，不表示整个任务完成；Ready 十分钟后
  自动隐藏，清除操作只保存全局时间戳。

## Desktop

顶级导航只有 Home、Connect、Troubleshooting、Settings。Home 展示完整的可见
Inbox；Connect 只展示 Claude Code/Codex，Cursor、OpenCode、Manual 收入
Experimental 折叠区。Companion 与浏览器 Dashboard 是本地辅助界面。

## 安全接入

- Desktop 只读检查 `%USERPROFILE%\\.claude\\settings.json`、
  `%CODEX_HOME%\\hooks.json` 或 `%USERPROFILE%\\.codex\\hooks.json`；Codex
  `config.toml` 也只用于检查兼容 `notify` 路径。
- 使用 **Copy setup snippet** 复制片段，保留无关配置并手工合并，再使用
  **Check status**。Crewlight 不写入这些配置文件。
- 请在 Codex `/hooks` 中核对并信任定义；检测到定义不等于已收到真实事件。

## 从源码运行

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

Windows 发布构建使用固定 Node 22.23.2，生成 standalone、Portable、
Installer、对应的三个 `.sha256` sidecar 和 `release-manifest.json`：

```bash
pnpm release:node-runtime
pnpm release:verify
```

Linux/macOS 继续参加源码验证，但不发布 v0.5 原生二进制。

测试用的 Windows Server 2025 主机上的打包 Portable 验收覆盖正常启动、本地
服务启动/停止、真实 Codex 形状事件、onboarding 完成、demo、只读检查固定路径
中的 Claude Code 与 Codex 且不自动写入配置、浮动 companion，以及不暴露原始工作
内容。手工合并配置仍是产品使用说明的一部分。

Daemon 默认只监听 loopback，内存上限为 1,000 个 session 与 100,000 个稳定
事件 ID；没有云服务或持久化 session 历史。

更多信息：

- [无 Node 安装](docs/install-without-node.md)
- [架构](docs/architecture.md)
- [源码与发布验证](docs/release-validation.md)
- [产品定位](docs/product/positioning.md)
