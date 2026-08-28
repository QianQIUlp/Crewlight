# v0.5.0 Release Checklist

Status: **Candidate prerelease; local packaged Portable acceptance recorded on Windows Server 2025**

## Packaging & Windows release

- [x] All workspaces package versions are `0.5.0`
- [x] Root package version is `0.5.0`
- [x] CLI help displays `Crewlight v0.5.0`
- [x] `pnpm release:node-runtime` and `pnpm release:verify` pass on Windows x64
- [x] The Windows job produces exactly:
  - `crewlight-v0.5.0-windows-x64.zip`
  - `crewlight-v0.5.0-windows-x64-desktop.zip`
  - `crewlight-v0.5.0-windows-x64-installer.exe`
- [x] All three distributables have `.sha256` sidecars and appear exactly once
      in the original `release-manifest.json`
- [x] A fresh Windows CI runner downloads both uploads, verifies the original
      manifest, and checks the Portable archive structure
- [x] Local packaged Portable acceptance is recorded on the tested Windows
      Server 2025 host
- [x] Linux/macOS remain source-validation targets without v0.5 native assets

## Integration boundary

- [x] Claude Code and Codex are the only formal v0.5 integrations
- [x] Cursor, OpenCode, and manual ingest remain collapsed experimental bridges
- [x] Codex Hooks are trust-reviewed; `notify` remains a compatibility input
- [x] Desktop performs read-only fixed-path inspection; no automatic config
      write occurs

## Verification

- [x] `pnpm validate` provides the single developer source-validation gate
- [x] `pnpm format:check` runs successfully
- [x] `pnpm typecheck` compiles clean
- [x] `pnpm test` executes the complete test suite successfully
- [x] `pnpm build` creates release bundles in `packages/*/dist`
- [x] The `source-validation` CI matrix passes on Linux x64, Windows x64, macOS arm64, and macOS x64
- [x] The Windows x64 native release and Windows evidence jobs pass

See [Source and Release Validation](release-validation.md) for the command
contract, runner mapping, artifact outputs, and automation boundaries.

## Local Portable acceptance

- [x] Portable launches normally without Node.js on the tested Windows Server
      2025 host
- [x] The local service starts and stops
- [x] A real Codex-shaped event reaches the local Inbox
- [x] Onboarding completes
- [x] Demo data populates deterministic sessions in Home and Companion
- [x] Claude Code and Codex fixed paths are inspected read-only; no automatic
      config write occurs
- [x] The floating companion can be shown from the desktop app
- [x] Prompt, transcript, reasoning, tool I/O, and raw work content are not
      retained or exposed

This record covers the Portable path; Installer-specific GUI behavior remains
unclaimed, while CI artifact checks are recorded separately.

## Security Boundaries

- [x] No raw transcripts, parameters, prompts, or inputs leak in normalized events
- [x] Daemon defaults to loopback and the dashboard refuses non-loopback binding
- [x] SSH private keys are never transmitted over network or log structures
- [x] Desktop performs read-only fixed-path inspection; no automatic config
      write occurs
