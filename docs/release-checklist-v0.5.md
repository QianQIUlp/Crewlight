# v0.5.0 Release Checklist

Status: **Ready for verification**

## Packaging & Cross-Platform

- [ ] All workspaces package versions are `0.5.0`
- [ ] Root package version is `0.5.0`
- [ ] CLI help displays `Crewlight v0.5.0`
- [ ] Release packages compile and package successfully on all three platforms:
  - `Crewlight-0.5.0-x64.AppImage` (Linux x64)
  - `Crewlight-0.5.0-x64.deb` (Linux deb)
  - `Crewlight-Setup-v0.5.0.exe` (Windows Installer)
  - `Crewlight-0.5.0-arm64.dmg` (macOS Apple Silicon)
  - `Crewlight-0.5.0-x64.dmg` (macOS Intel)

## Adapters

- [ ] `packages/adapters/` contains 17 active adapters
- [ ] Precision adapters have dedicated packages:
  - [ ] `@crewlight/adapter-claude-code`
  - [ ] `@crewlight/adapter-codex`
  - [ ] `@crewlight/adapter-cursor`
  - [ ] `@crewlight/adapter-opencode`
  - [ ] `@crewlight/adapter-generic-cli`
  - [ ] `@crewlight/adapter-gemini-cli`
  - [ ] `@crewlight/adapter-copilot-cli`
  - [ ] `@crewlight/adapter-antigravity`
  - [ ] `@crewlight/adapter-codebuddy`
  - [ ] `@crewlight/adapter-codewhale`
  - [ ] `@crewlight/adapter-hermes-agent`
  - [ ] `@crewlight/adapter-kimi-cli`
  - [ ] `@crewlight/adapter-kiro-cli`
  - [ ] `@crewlight/adapter-mimo-code`
  - [ ] `@crewlight/adapter-openclaw`
  - [ ] `@crewlight/adapter-pi-agent`
  - [ ] `@crewlight/adapter-qoder`
  - [ ] `@crewlight/adapter-qoderwork`
  - [ ] `@crewlight/adapter-qwen-code`
  - [ ] `@crewlight/adapter-reasonix-cli`
- [ ] All setup command generation outputs match schemas

## Verification

- [ ] `pnpm format:check` runs successfully
- [ ] `pnpm typecheck` compiles clean
- [ ] `pnpm test` executes and passes all 523 tests successfully
- [ ] `pnpm build` creates release bundles in `packages/*/dist`

## Security Boundaries

- [ ] No raw transcripts, parameters, prompts, or inputs leak in the normalized events
- [ ] Service operates strictly loopback-only
- [ ] SSH private keys are never transmitted over network or log structures
