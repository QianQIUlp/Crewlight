# Changelog

Notable Crewlight changes are recorded here.

## v0.5.0 — 2026-07-20

### Added
- Cross-platform desktop packaging support for Windows (NSIS .exe), macOS (DMG universal/Intel), and Linux (AppImage & deb).
- 14 new dedicated agent adapters: Gemini CLI, Copilot CLI, Antigravity (agy), CodeBuddy, Kiro CLI, Kimi CLI, Qwen Code, CodeWhale, MiMo Code, Pi, OpenClaw, Hermes Agent, Qoder, Qoderwork, and Reasonix CLI.
- SSH remote tunneling: reverse-port forward events from remote devservers over secure SSH tunnels using an annotate-only config marker `# CrewlightRemote: yes`.
- UI: Show elapsed time metrics and idle stuck warnings on cards, waiting permission amber pulse-border effects, and detail card expansions.
- Remote CLI installation guide modal triggered automatically on missing remote binaries.

### Fixed
- SSH tunnel: resolved infinite reconnect loops caused by failed port forwarding.
- SSH tunnel: corrected checkRemoteCli check executing commands on unestablished tunnels.
- CLI: Added gemini-cli, copilot-cli, and antigravity to setup list help text.

## v0.4.0 - Archived prototype release

- Breaking rename from AgentPulse to Crewlight.
- Current CLI/package/artifact identity uses Crewlight.
- Includes companion UI, Cursor bridge, and multi-agent demo work from the latest main state.
- Known limitations remain.
- This repository is archived and not actively maintained.

### Breaking changes

- AgentPulse has been renamed to Crewlight across the product, CLI, packages,
  artifacts, docs, and release identity.
- The `agentpulse` command has been replaced by `crewlight`.
- `AGENTPULSE_*` environment variables have been replaced by
  `CREWLIGHT_*`.
- Internal monorepo package identities now use the `@crewlight/*` scope.

### Added

- A productized Crewlight Desktop app with a main control window, onboarding,
  companion controls, demo flow, local service manager, and desktop-first
  release positioning.
- The `crewlight demo multi-agent` scenario for repeatable dashboard and
  companion verification.
- A portable Windows desktop artifact and unsigned NSIS installer path for the
  desktop release.

### Changed

- Release-facing docs now describe the desktop app as the primary user-facing
  v0.4.0 surface.
- The browser dashboard is now positioned as a secondary developer surface and
  the CLI as the advanced / automation surface.
- Migration guidance now points existing users to regenerate setup snippets and
  update the Git remote after the repository rename.

### Migration

- Regenerate local setup snippets with `crewlight setup ... --print`.
- Update the local Git remote after the repository rename:

  ```bash
  git remote set-url origin https://github.com/QianQIUlp/Crewlight.git
  ```

## v0.3.0 — 2026-06-21

### Added

- Setup verification flows and expanded read-only doctor diagnostics.
- Status-first dashboard views, attention states, focused session details, and
  opt-in prompt-preview task titles.
- An OpenCode local-plugin MVP with allowlisted event normalization and
  non-blocking ingest behavior.
- Explicit Codex CLI and Desktop surface metadata for lifecycle hooks.
- A sanitized Antigravity research probe with documented evidence boundaries.

### Changed

- Hardened Claude Code and Codex hook setup, command execution, diagnostics,
  and daemon delivery behavior.
- Expanded documentation for standalone installation, dashboard operation,
  supported integration levels, and local verification.

### Known limitations

- OpenCode is implemented but still requires verification against a real local
  installation before it can be labeled supported.
- Codex Desktop remains experimental.
- Antigravity remains research-only and is not a stable adapter or setup path.
