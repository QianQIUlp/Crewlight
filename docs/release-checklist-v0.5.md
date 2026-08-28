# v0.5.0 Release Checklist

Status: **Candidate; no public v0.5.0 download until Windows acceptance is complete**

## Packaging & Windows release

- [x] All workspaces package versions are `0.5.0`
- [x] Root package version is `0.5.0`
- [x] CLI help displays `Crewlight v0.5.0`
- [ ] `pnpm release:node-runtime` and `pnpm release:verify` pass on Windows x64
- [ ] The Windows job produces exactly:
  - `crewlight-v0.5.0-windows-x64.zip`
  - `crewlight-v0.5.0-windows-x64-desktop.zip`
  - `crewlight-v0.5.0-windows-x64-installer.exe`
- [ ] All three distributables have `.sha256` sidecars and appear exactly once
      in the original `release-manifest.json`
- [ ] A fresh Windows CI runner downloads both uploads, verifies the original
      manifest, and checks the Portable archive structure
- [ ] Windows 11 x64 installer and portable archive pass physical-machine and clean Azure VM acceptance
- [x] Linux/macOS remain source-validation targets without v0.5 native assets

## Integration boundary

- [x] Claude Code and Codex are the only formal v0.5 integrations
- [x] Cursor, OpenCode, and manual ingest remain collapsed experimental bridges
- [x] Codex Hooks are trust-reviewed; `notify` remains a compatibility input
- [ ] Desktop only copies setup snippets and checks fixed user-level paths;
      checking does not modify configuration

## Verification

- [x] `pnpm validate` provides the single developer source-validation gate
- [x] `pnpm format:check` runs successfully
- [x] `pnpm typecheck` compiles clean
- [x] `pnpm test` executes the complete test suite successfully
- [x] `pnpm build` creates release bundles in `packages/*/dist`
- [ ] The `source-validation` CI matrix passes on Linux x64, Windows x64, macOS arm64, and macOS x64
- [ ] The Windows x64 native release and Windows evidence jobs pass

See [Source and Release Validation](release-validation.md) for the command
contract, runner mapping, artifact outputs, and automation boundaries.

## Manual Windows gates

- [ ] Record the final commit and identical artifact SHA-256 values for a daily
      Windows 11 x64 machine and a clean Azure Windows 11 x64 VM
- [ ] Installer and Portable paths launch without Node.js on both machines
- [ ] Manual Claude Code and Codex setup, read-only status checks, `/hooks`
      review, and real turns work on both machines
- [ ] Waiting, completed, failed, stale, ordering, notification deduplication,
      tray close, service exit, restart, and uninstall/cleanup are verified
- [ ] Prompt, transcript, reasoning, tool I/O, and raw payload content are not
      retained or exposed
- [ ] Keyboard access, visible focus, forced colors, reduced motion, and 200%
      text scaling are verified on the daily Windows machine
- [ ] Unsigned trust behavior and screenshots from the actual GUI are recorded

Passing `pnpm release:verify` or a CI artifact job does not complete these manual
gates.

## Security Boundaries

- [x] No raw transcripts, parameters, prompts, or inputs leak in normalized events
- [x] Daemon defaults to loopback and the dashboard refuses non-loopback binding
- [x] SSH private keys are never transmitted over network or log structures
- [ ] Desktop inspection leaves Claude and Codex configuration byte-for-byte
      unchanged
