<p align="center">
  <img src="assets/readme/crewlight-mark.svg" width="112" alt="Crewlight pulse mark">
</p>

<h1 align="center">Crewlight</h1>

<p align="center"><strong>面向并行编码工作的本地 Agent Attention Inbox。</strong></p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

> v0.5.0 是 Windows-first 候选版本。Windows 11 x64 计划标记为
> Supported（未签名）；Linux/macOS 为 Preview；Remote 为 Beta。实体
> Windows 11 与干净 Azure VM 验收完成前，不显示 v0.5.0 下载 CTA。
> v0.4.0 是 2026-06-23 发布的 archived prototype。

Crewlight 用一个本地只读 Inbox 回答三个问题：哪个 Agent 需要我、哪个仍在
运行、哪个出了问题。正式集成只有 Claude Code 与 Codex Hooks；已有 Codex
`notify` 作为完成事件兼容入口，不是完整的一键接入路径。

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

- Claude：只写 `%USERPROFILE%\\.claude\\settings.json`。
- Codex：默认只写 `%CODEX_HOME%\\hooks.json`，未设置时使用
  `%USERPROFILE%\\.codex\\hooks.json`；`config.toml` 只读检查。
- 安装流程会解析、合并、临时写入、重新解析、备份并受控替换；失败尽量逐字节
  恢复。不能安全表示的路径降级为 Copy setup，不产生部分写入。
- 安装后请在 Codex `/hooks` 中核对并信任定义；安装成功不等于已收到真实事件。

## 从源码运行

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

发布构建使用固定 Node 22.23.2，并为每个实际分发物生成
`release-manifest.json` 与 `.sha256` sidecar：

```bash
pnpm release:node-runtime
pnpm release:verify
```

Daemon 默认只监听 loopback，内存上限为 1,000 个 session 与 100,000 个稳定
事件 ID；没有云服务或持久化 session 历史。

更多信息：

- [无 Node 安装](docs/install-without-node.md)
- [架构](docs/architecture.md)
- [源码与发布验证](docs/release-validation.md)
- [产品定位](docs/product/positioning.md)
