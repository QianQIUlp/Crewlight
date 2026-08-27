<p align="center">
  <img src="assets/readme/crewlight-mark.svg" width="112" alt="Crewlight pulse mark">
</p>

<h1 align="center">Crewlight</h1>

<p align="center"><strong>Local Agent Attention Inbox for concurrent coding work.</strong></p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://github.com/QianQIUlp/Crewlight/actions/workflows/ci.yml">CI</a>
</p>

> v0.5.0 is a Windows-first candidate. Windows 11 x64 is the planned
> Supported platform (unsigned); Linux and macOS are Preview; Remote is Beta.
> There is no public v0.5.0 download CTA until the physical Windows 11 and clean
> Azure VM acceptance gates pass. v0.4.0 was an archived prototype published
> on 2026-06-23.

Crewlight answers three questions while several agents work: **does one need
me, is one still running, or did one fail?** It observes safe, allowlisted
events locally and presents one Inbox in Desktop, Companion, and the optional
loopback browser dashboard.

## Product contract

- Formal integrations: Claude Code and Codex Hooks. Existing Codex `notify`
  remains a compatibility completion input, not the full one-click path.
- Windows Desktop includes Installer and Portable distribution paths; all
  release artifacts are unsigned or explicitly marked not notarized.
- Linux/macOS remain Preview and Remote remains Beta.
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

The Desktop installer writes only fixed user-level files:

- Claude Code: `%USERPROFILE%\\.claude\\settings.json`
- Codex Hooks: `%CODEX_HOME%\\hooks.json`, or `%USERPROFILE%\\.codex\\hooks.json`

Codex `config.toml` is inspected read-only. Writes use parse/merge,
same-directory temporary files, readback validation, backup, controlled replacement,
and byte-for-byte rollback on failure. Paths that cannot be safely represented
by the platform command contract fall back to Copy setup without partial writes.
After installation, review and trust the definition in Codex `/hooks`; an
installed definition is not proof that a live event has arrived.

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

Build and verify native release artifacts with the pinned Node input (the SEA
binary and `LICENSE` come from the same verified archive):

```bash
pnpm release:node-runtime
pnpm release:verify
```

The release process produces a generated `release-manifest.json` and a
`.sha256` sidecar for every distributable. Do not describe CI artifact success
as Windows GUI acceptance; the final release requires real Windows 11 and
clean Azure VM evidence.

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
