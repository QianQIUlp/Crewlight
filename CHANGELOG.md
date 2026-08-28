# Changelog

Notable Crewlight changes are recorded here.

## v0.5.0 — Unreleased

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

Release policy: Windows 11 x64 is Supported but unsigned; Linux and macOS are
source-validated Preview targets without v0.5 native binaries; Remote is Beta.
v0.5.0 remains Unreleased until the physical Windows 11 and clean Azure VM
acceptance gates pass.

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
