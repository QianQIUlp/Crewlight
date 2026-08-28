<p align="center">
  <img src="assets/readme/crewlight-mark.svg" width="112" alt="Crewlight pulse mark">
</p>

<h1 align="center">Crewlight</h1>

<p align="center"><strong>Local Agent Attention Inbox for concurrent coding work.</strong></p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml">CI</a>
</p>

> v0.5.0 is a Windows-first candidate. Windows x64 is the planned
> Supported platform (unsigned); Linux and macOS are Preview; Remote is Beta.
> Local packaged Portable acceptance is recorded on the tested Windows Server
> 2025 host. Downloads are available from the
> [v0.5.0 GitHub prerelease](https://github.com/QianQIUlp/Crewlight/releases/tag/v0.5.0).
> v0.4.0 was an archived prototype published on 2026-06-23.

Crewlight answers three questions while several agents work: **does one need
me, is one still running, or did one fail?** It observes safe, allowlisted
events locally and presents one Inbox in Desktop, Companion, and the optional
loopback browser dashboard.

## Product contract

- Formal integrations: Claude Code and Codex Hooks. Existing Codex `notify`
  remains a compatibility completion input, not the full lifecycle hook path.
- Windows Desktop includes Installer and Portable distribution paths; all
  v0.5 release artifacts are unsigned.
- Linux/macOS remain source-validated Preview targets without v0.5 native
  binaries. Remote remains Beta.
- Crewlight is read-only: it does not control agents, approve permissions,
  inspect worktrees, store cloud history, or scan JSONL/transcripts.
- Prompt Preview is off by default. Prompts, transcripts, reasoning, tool I/O,
  and raw platform payloads are never retained or forwarded.

## Desktop surfaces

Desktop has four top-level areas: **Home**, **Connect**,
**Troubleshooting**, and **Settings**. Home is the complete visible Inbox and
uses the single Attention Engine priority order:

`needs_action > error > stale > active > ready > hidden`

`completed` means “turn finished / ready for review,” not that an entire task
is complete. Ready turns naturally disappear after ten minutes; clearing them
stores only a global timestamp and does not delete sessions.

## Integration setup

Desktop Connect checks only these fixed user-level files, read-only:

- Claude Code: `%USERPROFILE%\\.claude\\settings.json`
- Codex Hooks: `%CODEX_HOME%\\hooks.json`, or `%USERPROFILE%\\.codex\\hooks.json`

Codex `config.toml` is also inspected read-only for the compatibility `notify`
path. Use **Copy setup snippet**, merge it manually while preserving unrelated
configuration, then use **Check status**. Crewlight never writes these files.
Review and trust the definition in Codex `/hooks`; a detected definition is not
proof that a live event has arrived.

## Running from source

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

Useful commands:

```bash
crewlight setup claude-code --print
crewlight setup codex-hooks --print
crewlight daemon --managed-stdio --notifier none
crewlight status --json
```

On Windows, build and verify the v0.5 release artifacts with the pinned Node
input (the SEA binary and `LICENSE` come from the same verified archive):

```bash
pnpm release:node-runtime
pnpm release:verify
```

The Windows release process produces standalone, Portable, and Installer
artifacts, a `.sha256` sidecar for each, and a generated
`release-manifest.json`. Linux/macOS remain in the source-validation matrix but
do not publish v0.5 binaries. Local packaged Portable acceptance on the tested
Windows Server 2025 host covers normal launch, local service start/stop, a real
Codex-shaped event, onboarding completion, demo, read-only fixed-path Claude
Code and Codex inspection with no automatic config write, the floating
companion, and no raw work content.

## Data and limits

The daemon is loopback-only by default and keeps at most 1,000 sessions and
100,000 stable event IDs in memory. There is no cloud service or persisted
session history. `sessionId` is platform identity; `sessionKey` is a namespaced
Crewlight aggregation key.

## Documentation

- [Install without Node](docs/install-without-node.md)
- [Architecture](docs/architecture.md)
- [Source and release validation](docs/release-validation.md)
- [Desktop companion surface](docs/companion-surface.md)
- [Product positioning](docs/product/positioning.md)
- [Simplified Chinese README](README.zh-CN.md)

After upgrading, regenerate local setup snippets so the command path and hook
shape match the installed Crewlight build:

```bash
crewlight setup claude-code --print
crewlight setup codex-hooks --print
```
