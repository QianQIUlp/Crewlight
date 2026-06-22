# Changelog

Notable Crewlight changes are recorded here.

## v0.4.0 — Unreleased

### Breaking changes

- AgentPulse has been renamed to Crewlight across the product, CLI, packages,
  artifacts, docs, and release identity.
- The `agentpulse` command has been replaced by `crewlight`.
- `AGENTPULSE_*` environment variables have been replaced by
  `CREWLIGHT_*`.
- Internal monorepo package identities now use the `@crewlight/*` scope.

### Added

- A productized local companion surface and refreshed dashboard positioning for
  multi-agent coding workflows.
- The `crewlight demo multi-agent` scenario for repeatable dashboard and
  companion verification.
- Release-verified standalone artifact naming aligned with Crewlight.

### Changed

- Release-facing docs, setup snippets, standalone install instructions, and CI
  artifact names now use Crewlight as the primary identity.
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
