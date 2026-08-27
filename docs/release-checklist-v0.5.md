# v0.5.0 Release Checklist

Status: **Candidate; no public v0.5.0 download until Windows acceptance is complete**

## Packaging & Cross-Platform

- [x] All workspaces package versions are `0.5.0`
- [x] Root package version is `0.5.0`
- [x] CLI help displays `Crewlight v0.5.0`
- [ ] Windows 11 x64 installer and portable archive pass physical-machine and clean Azure VM acceptance
- [ ] `pnpm release:verify` passes on each supported native release target
- [ ] Release packages compile and package successfully on all three platforms:
  - `Crewlight-<version>-x64.AppImage` (Linux x64)
  - `Crewlight-<version>-x64.deb` (Linux deb)
  - `crewlight-v0.5.0-windows-x64-installer.exe` (Windows Installer)
  - `Crewlight-<version>-arm64.dmg` (macOS Apple Silicon)
  - `Crewlight-<version>-x64.dmg` (macOS Intel)

## Integration boundary

- [x] Claude Code and Codex are the only formal v0.5 integrations
- [x] Cursor, OpenCode, and manual ingest remain collapsed experimental bridges
- [x] Codex Hooks are trust-reviewed; `notify` remains a compatibility input

## Verification

- [x] `pnpm validate` provides the single developer source-validation gate
- [x] `pnpm format:check` runs successfully
- [x] `pnpm typecheck` compiles clean
- [x] `pnpm test` executes the complete test suite successfully
- [x] `pnpm build` creates release bundles in `packages/*/dist`
- [ ] The `source-validation` CI matrix passes on Linux x64, Windows x64, macOS arm64, and macOS x64
- [ ] Native release artifact jobs pass for Linux x64, Windows x64, macOS arm64, and macOS x64
- [ ] Every distributable has a generated `.sha256` sidecar and appears exactly once in `release-manifest.json`

See [Source and Release Validation](release-validation.md) for the command
contract, runner mapping, artifact outputs, and automation boundaries.

## Manual Desktop Gates

- [ ] The packaged desktop app launches on Linux x64, Windows x64, macOS arm64, and macOS x64
- [ ] Onboarding, service controls, companion controls, and preference persistence work on the target OS
- [ ] Installer/uninstaller behavior is verified where applicable
- [ ] Native notification delivery is verified on the target OS
- [ ] Signing, notarization, and operating-system trust behavior is recorded
- [ ] Release screenshots come from an actual GUI-capable run

Passing `pnpm release:verify` or a CI artifact job does not complete these manual
gates.

## Security Boundaries

- [x] No raw transcripts, parameters, prompts, or inputs leak in normalized events
- [x] Daemon defaults to loopback and the dashboard refuses non-loopback binding
- [x] SSH private keys are never transmitted over network or log structures
