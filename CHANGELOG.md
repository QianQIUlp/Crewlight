# Changelog

Notable Crewlight changes are recorded here.

## v0.5.0 — Unreleased candidate (prerelease 2026-08-28)

- Windows-first local Agent Attention Inbox for concurrent Claude Code and
  Codex sessions.
- One Attention Engine with needs-action, error, stale, active, ready, and
  hidden priorities, plus duplicate-safe notifications.
- Read-only user-level Claude Code and Codex Hooks inspection, copyable manual
  setup snippets, `/hooks` trust guidance, and no configuration mutation.
- Managed Windows daemon lifecycle and a compact Home / Connect /
  Troubleshooting / Settings Desktop information architecture.
- Pinned Node 22.23.2 release inputs, a generated manifest, and SHA-256
  sidecars for the Windows standalone, Portable, and Installer artifacts.
- Local packaged Portable acceptance on the tested Windows Server 2025 host
  covers normal launch, local service start/stop, a real Codex-shaped event,
  onboarding completion, demo, read-only fixed-path Claude Code and Codex
  inspection with no automatic config write, the floating companion, and no
  raw work content.

Release policy: Windows x64 is Supported but unsigned; Linux and macOS are
source-validated Preview targets without v0.5 native binaries; Remote is Beta.
Local packaged Portable acceptance is recorded on the tested Windows Server
2025 host; v0.5.0 is published as a candidate GitHub prerelease.

## v0.4.0 — Archived prototype, published 2026-06-23

- Breaking rename from AgentPulse to Crewlight.
- Included the early companion UI, Cursor bridge, and multi-agent demo work.
- No portable Windows Desktop ZIP was published for this archived prototype.

## v0.3.0

- Setup verification flows, bounded diagnostics, status-first dashboard views,
  and opt-in prompt-preview task titles.
- OpenCode local-plugin MVP and explicit Codex CLI/Desktop surface metadata.

## v0.2.0

- Added the local daemon, normalized event model, adapters, and CLI ingest
  commands.
