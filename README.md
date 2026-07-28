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

> Development status: v0.5.0 is a stabilization candidate. Linux x64 has
> passed local build and smoke verification; Windows and macOS still require
> platform-specific fixes and verification. The latest published release
> remains v0.4.0.

<p align="center">
  <a href="https://github.com/QianQIUlp/Crewlight/releases/tag/v0.4.0"><img src="https://img.shields.io/badge/latest_release-v0.4.0-0f766e" alt="Latest release v0.4.0"></a>
  <img src="https://img.shields.io/badge/v0.5.0-Linux_verified%3B_Windows_/_macOS_pending-334155" alt="v0.5.0 status: Linux verified; Windows and macOS pending">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/QianQIUlp/Crewlight" alt="MIT license"></a>
  <a href="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml"><img src="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
</p>

Crewlight Desktop is the primary user experience. It packages the main control window, floating companion, local service controls, demo flow, and integration setup into one local-first desktop utility.

The browser dashboard is a secondary developer surface. The CLI remains the advanced and automation surface.

## v0.5.0 Stabilization Status

There is no published v0.5.0 release yet. The current branch has been verified
locally on Linux x64, including the standalone archive, checksum, restricted
`PATH` startup, daemon, dashboard, ingest, status, and doctor smoke flow.

Windows x64 and macOS x64/arm64 packaging, native notification, SSH, and full
desktop runtime flows remain release gates. Do not treat generated package names
or unverified platform code as published downloads.

The [v0.4.0 release](https://github.com/QianQIUlp/Crewlight/releases/tag/v0.4.0)
remains available as a historical reference build.

### Intended first-run flow

1. Download and open the appropriate installer or package for your OS.
2. Launch `Crewlight`.
3. Complete onboarding.
4. Keep the local service, demo sessions, and companion nearby.

See [install without Node](docs/install-without-node.md) for the advanced CLI artifacts.

## Product Surfaces

| Surface            | Role in the v0.5.0 candidate                                          |
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

The Linux standalone build currently verified from source is:

- `crewlight-v0.5.0-linux-x64.tar.gz`

Windows and macOS artifacts are not yet verified or published for v0.5.0.

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
- No persisted session history; the daemon keeps only the latest 1,000 sessions
  in memory

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
