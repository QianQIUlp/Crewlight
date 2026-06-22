# Contributing to Crewlight

[简体中文](CONTRIBUTING.zh-CN.md) | English

Thanks for considering a contribution to Crewlight.

Crewlight is intended to be a small, reliable observability layer for AI coding agents. Contributions are welcome, but the project works best when changes are scoped, testable, and easy to review.

## Good first contribution areas

- Documentation fixes and bilingual documentation improvements.
- Small CLI usability improvements.
- Adapter examples for AI coding agents.
- Smoke tests for release artifacts.
- Clearer error messages and fallback behavior.
- Platform-specific installation notes.

## Before opening a pull request

Please check that your change has a narrow purpose.

Avoid combining unrelated work in one PR. For example, do not mix a new adapter, a persistence layer, a GUI, and documentation rewrites in the same change.

For code changes, run the local validation commands:

```bash
pnpm install
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For documentation-only changes, at least review the rendered Markdown and check that links are valid.

## Pull request expectations

A good PR should include:

- A concise summary of what changed.
- The reason the change is needed.
- Manual verification steps, if applicable.
- Screenshots or terminal output only when they clarify behavior.

Keep PRs small enough that a reviewer can understand the intent without reconstructing the entire project context.

## Design boundaries

Crewlight should remain predictable and conservative.

Please do not introduce changes that:

- Automatically modify a user's Claude Code, Codex, IDE, or shell configuration without explicit action.
- Silently swallow failures when notification delivery is unavailable.
- Add broad infrastructure before there is a concrete adapter or workflow need.
- Turn the project into a single-agent notification wrapper.

The preferred pattern is:

1. Detect or ingest one real event.
2. Normalize it clearly.
3. Notify or fall back visibly.
4. Keep failure behavior explainable.

## Adding an adapter

When adding support for a new AI coding agent, prefer the smallest useful path:

- Document how the agent emits events or hooks.
- Add only the adapter surface needed for a minimal real workflow.
- Include fixture data or tests where practical.
- Document setup steps clearly.
- Avoid automatic user configuration mutation unless it is explicitly designed and reviewed.

## Issue reports

Useful issue reports include:

- Operating system and shell.
- Agent or tool being used.
- Crewlight version.
- The exact command or configuration snippet.
- Expected behavior.
- Actual behavior.
- Relevant terminal output.

## Maintainer note

This repository is still early. The highest-value contributions are clarity, reproducibility, and small improvements that make real agent workflows easier to observe.
