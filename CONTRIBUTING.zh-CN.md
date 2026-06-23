# 参与贡献 Crewlight

[English](CONTRIBUTING.md) | 简体中文

感谢你考虑为 Crewlight 做贡献。

Crewlight 的定位是一个小而可靠的 AI coding agent 可观测层。这个项目欢迎协作，但更偏好范围清晰、可验证、容易 review 的改动。

## 适合开始的贡献方向

- 文档修正与中英双语补充。
- 小范围桌面端或 companion surface 改进。
- 小型 CLI 易用性改进。
- AI coding agent adapter 示例。
- 发布物 smoke test。
- 更清晰的错误信息与 fallback 行为。
- 平台相关安装说明。

## 提交 PR 前

请先确认你的改动目标足够窄。

不要把无关内容混在一个 PR 里。例如，不要在同一个 PR 中同时加入新 adapter、持久化层、GUI 和大范围文档重写。

如果涉及代码改动，请运行本地校验：

```bash
pnpm install
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

如果改动涉及 Windows 桌面端，也请补充验证：

```bash
pnpm package:desktop:portable
pnpm package:desktop:installer
```

如果只是文档改动，至少检查 Markdown 渲染效果，并确认链接有效。

## PR 应该包含什么

一个容易 review 的 PR 应该包含：

- 改了什么。
- 为什么需要这个改动。
- 适用时提供手动验证步骤。
- 只有在能说明行为时才附截图或终端输出。

PR 的范围应足够小，让 review 者不需要重新理解整个项目背景也能判断改动是否合理。

## 设计边界

Crewlight 应保持可预测、克制、可解释。

请避免引入以下改动：

- 未经用户明确操作就自动修改 Claude Code、Codex、IDE 或 shell 配置。
- 通知投递失败时静默吞掉错误。
- 在没有具体 adapter 或工作流需求前引入大基础设施。
- 把项目收缩成某一个 agent 的专用通知器。

推荐的实现路径是：

1. 捕获或接收一个真实事件。
2. 清晰地归一化事件。
3. 投递通知，或显式 fallback。
4. 让失败行为可解释。

## 添加新 adapter

如果要支持新的 AI coding agent，优先选择最小可用路径：

- 说明该 agent 如何暴露事件、hook 或通知机制。
- 只添加最小真实工作流所需的 adapter 表面。
- 尽量加入 fixture 或测试。
- 清楚记录设置步骤。
- 除非经过明确设计和 review，不要自动修改用户配置。

## 提交 issue

有用的 issue 通常包含：

- 操作系统与 shell。
- 使用的 agent 或工具。
- Crewlight 版本。
- 具体命令或配置片段。
- 预期行为。
- 实际行为。
- 相关终端输出。

## 维护者说明

这个仓库还处在早期阶段。当前最有价值的贡献是：让行为更清楚、让问题更容易复现、让真实 agent 工作流更容易被观察。
