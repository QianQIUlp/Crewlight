# v0.5.0 Release Checklist

Status: **Linux x64 verified locally; Windows and macOS release verification pending**

## Packaging & Cross-Platform

- [x] All workspaces package versions are `0.5.0`
- [x] Root package version is `0.5.0`
- [x] CLI help displays `Crewlight v0.5.0`
- [x] Linux x64 standalone archive, checksum, restricted-PATH startup, daemon, dashboard, ingest, status, and doctor smoke checks pass
- [ ] `pnpm release:verify` passes on each supported native release target
- [ ] Release packages compile and package successfully on all three platforms:
  - `Crewlight-0.5.0-x86_64.AppImage` (Linux x64)
  - `Crewlight-0.5.0-amd64.deb` (Linux deb)
  - `crewlight-v0.5.0-windows-x64-desktop.zip` (Windows Portable)
  - `Crewlight-Setup-v0.5.0.exe` (Windows Installer)
  - `Crewlight-0.5.0-arm64.dmg` (macOS Apple Silicon)
  - `Crewlight-0.5.0-x64.dmg` (macOS Intel)
- [ ] The Windows portable zip extracts once with `Crewlight.exe` at its root
      and without macOS-only notifier helpers
- [x] Linux AppImage/deb payloads use portable modes and exclude the macOS-only
      notifier bundle
- [ ] The macOS arm64 notification path does not depend on an x64-only helper

## Adapters

- [x] `packages/adapters/` contains 21 adapter packages
- [x] Precision and parser-only adapters have dedicated packages:
  - [x] `@crewlight/adapter-claude-code`
  - [x] `@crewlight/adapter-codex`
  - [x] `@crewlight/adapter-cursor`
  - [x] `@crewlight/adapter-opencode`
  - [x] `@crewlight/adapter-generic-cli`
  - [x] `@crewlight/adapter-multi-agent`
  - [x] `@crewlight/adapter-gemini-cli`
  - [x] `@crewlight/adapter-copilot-cli`
  - [x] `@crewlight/adapter-antigravity`
  - [x] `@crewlight/adapter-codebuddy`
  - [x] `@crewlight/adapter-codewhale`
  - [x] `@crewlight/adapter-hermes-agent`
  - [x] `@crewlight/adapter-kimi-cli`
  - [x] `@crewlight/adapter-kiro-cli`
  - [x] `@crewlight/adapter-mimo-code`
  - [x] `@crewlight/adapter-openclaw`
  - [x] `@crewlight/adapter-pi-agent`
  - [x] `@crewlight/adapter-qoder`
  - [x] `@crewlight/adapter-qoderwork`
  - [x] `@crewlight/adapter-qwen-code`
  - [x] `@crewlight/adapter-reasonix-cli`
- [x] Supported setup output matches verified host schemas; MiMo, Pi Agent, OpenClaw, and Reasonix setup is disabled until dedicated bridges exist

## Verification

- [x] `pnpm validate` provides the single developer source-validation gate
- [x] `pnpm format:check` runs successfully
- [x] `pnpm typecheck` compiles clean
- [x] `pnpm test` executes the complete test suite successfully
- [x] `pnpm build` creates release bundles in `packages/*/dist`
- [ ] The `source-validation` CI matrix passes on Linux x64, Windows x64, macOS arm64, and macOS x64
- [ ] Native release artifact jobs pass for Linux x64, Windows x64, macOS arm64, and macOS x64

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
