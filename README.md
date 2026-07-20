<p align="center">
  <img src="assets/readme/crewlight-mark.svg" width="112" alt="Crewlight pulse mark">
</p>

<h1 align="center">Crewlight</h1>

<p align="center"><strong>Local activity radar for AI coding agents.</strong></p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

> Active release: Crewlight v0.5.0 is a fully functional cross-platform desktop application and CLI tool to monitor local-first activity of AI coding agents.

<p align="center">
  <a href="https://github.com/QianQIUlp/Crewlight/releases/tag/v0.5.0"><img src="https://img.shields.io/badge/release-v0.5.0-0f766e" alt="Release v0.5.0"></a>
  <img src="https://img.shields.io/badge/desktop-Win_/_macOS_/_Linux-334155" alt="Desktop platforms: Windows, macOS, Linux">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/QianQIUlp/Crewlight" alt="MIT license"></a>
  <a href="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml"><img src="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
</p>

Crewlight Desktop is the primary user experience. It packages the main control window, floating companion, local service controls, demo flow, and integration setup into one local-first desktop utility.

The browser dashboard is a secondary developer surface. The CLI remains the advanced and automation surface.

## Cross-Platform Desktop First

### Primary downloads (v0.5.0)

- **Windows**:
  - Installer: [`Crewlight-Setup-v0.5.0.exe`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.5.0/Crewlight-Setup-v0.5.0.exe)
- **macOS**:
  - dmg (Apple Silicon): [`Crewlight-0.5.0-arm64.dmg`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.5.0/Crewlight-0.5.0-arm64.dmg)
  - dmg (Intel): [`Crewlight-0.5.0-x64.dmg`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.5.0/Crewlight-0.5.0-x64.dmg)
- **Linux**:
  - AppImage: [`Crewlight-0.5.0-x64.AppImage`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.5.0/Crewlight-0.5.0-x64.AppImage)
  - deb: [`Crewlight-0.5.0-x64.deb`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.5.0/Crewlight-0.5.0-x64.deb)

### First-run flow

1. Download and open the appropriate installer or package for your OS.
2. Launch `Crewlight`.
3. Complete onboarding.
4. Keep the local service, demo sessions, and companion nearby.

See [install without Node](docs/install-without-node.md) for the advanced CLI artifacts.

## Product Surfaces

| Surface            | Role in v0.4.0                                                        |
| ------------------ | --------------------------------------------------------------------- |
| Crewlight Desktop  | Primary user-facing release surface                                   |
| Floating companion | Secondary persistent surface controlled from the desktop app          |
| Browser dashboard  | Secondary developer and inspection surface                            |
| CLI                | Advanced setup, scripting, ingest, diagnostics, and standalone builds |

## What The Desktop App Includes

- `Home` command center with local service state, live counts, and primary CTA
- `Doctor` section with start, stop, restart, diagnostics, and copyable summary
- `Agents` section with productized setup cards
- `Companion` controls for show, hide, mode, always-on-top, and bring-to-front
- `Demo` section with deterministic local synthetic sessions
- `Appearance` settings for theme, accent, and density
- `Settings` for host, port, notifier, onboarding replay, and local auto-start preference
- `About` section with migration notes and product boundaries

## Supported Integrations

| Integration            | Level                             | Current boundary                                                                |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| Claude Code            | Precise                           | Documented lifecycle hooks; observation only                                    |
| Codex hooks            | Precise lifecycle                 | Observes documented session, prompt, tool, permission, and stop events          |
| Codex `notify`         | Narrow official                   | Maps the documented `agent-turn-complete` notification                          |
| OpenCode               | Implemented, verification pending | Uses documented local plugin events                                             |
| Cursor                 | Manual / Experimental bridge      | Explicit commands only; no automatic Cursor lifecycle hook or private API claim |
| Manual / custom ingest | Manual                            | Caller-supplied normalized events and bounded local probes                      |

Crewlight remains local-first and read-only. It does not approve permissions,
control agent turns, persist session history, or scrape private APIs.

## Visual Assets

The release screenshots are captured from the actual desktop app and stored at:

- `assets/readme/crewlight-desktop-overview.png`
- `assets/readme/crewlight-desktop-agents.png`
- `assets/readme/crewlight-desktop-demo.png`
- `assets/readme/crewlight-desktop-companion.png`
- `assets/readme/companion-expanded-demo.png`

The current repository environment is headless. Screenshot capture remains a GUI
release-gate step.

## Browser Dashboard

The dashboard still exists at the loopback-only daemon endpoint, but it is no
longer the primary product entrypoint. Use it when you want an extra browser
view for current local sessions, setup snippets, and diagnostics.

See [dashboard guide](docs/dashboard.md).

## Advanced CLI Usage

The standalone CLI artifacts remain available:

- `crewlight-v0.4.0-linux-x64.tar.gz`
- `crewlight-v0.4.0-windows-x64.zip`

Use the CLI when you need:

- setup snippets for Claude Code, Codex, Cursor, or OpenCode
- hook and notify ingest
- standalone daemon usage
- scripting and CI-friendly commands
- manual normalized events

Examples:

```bash
crewlight setup claude-code --print
crewlight setup codex-hooks --print
crewlight daemon --dashboard --notifier none
crewlight demo multi-agent
crewlight status --json
```

## Breaking Rename

Crewlight is the renamed v0.4.0 successor to AgentPulse.

- `agentpulse` has been replaced by `crewlight`
- `AGENTPULSE_*` has been replaced by `CREWLIGHT_*`
- workspace packages now use `@crewlight/*`
- local setup snippets should be regenerated with `crewlight setup ... --print`

After the repository rename:

```bash
git remote set-url origin https://github.com/QianQIUlp/Crewlight.git
```

## Boundaries

- No cloud service
- No private API scraping
- No automatic permission approval
- No prompt, transcript, or tool I/O retention
- No persisted session history in v0.4.0

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Desktop development:

```bash
pnpm desktop:dev
```

Windows desktop packaging:

```bash
pnpm package:desktop:portable
pnpm package:desktop:installer
```

Related docs:

- [Install without Node](docs/install-without-node.md)
- [Desktop companion surface](docs/companion-surface.md)
- [Browser dashboard](docs/dashboard.md)
- [Product positioning](docs/product/positioning.md)
