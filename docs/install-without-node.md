# Install Crewlight Without Node.js

Crewlight v0.5.0 is a Windows-first Attention Inbox candidate. Local packaged
Portable acceptance is recorded on the tested Windows Server 2025 host. The
artifacts remain unsigned. Claude Code/Codex setup remains a manual product
instruction; acceptance used read-only fixed-path inspection with no automatic
config write. v0.4.0 was an archived prototype and did not publish a portable
Desktop ZIP.

## Windows Desktop

Published v0.5.0 prerelease assets:

- `crewlight-v0.5.0-windows-x64-desktop.zip` (Portable)
- `crewlight-v0.5.0-windows-x64-installer.exe` (Installer)

Portable desktop flow:

1. Download the exact asset named by the published `release-manifest.json`.
2. Verify its adjacent `.sha256` sidecar.
3. Extract `crewlight-v0.5.0-windows-x64-desktop.zip`.
4. Open the extracted folder and double-click `Crewlight.exe`.
5. Use onboarding to start the local service, choose Claude Code or Codex,
   copy and manually merge the setup snippet, check its status, trust the hook
   definition, and run a real turn. Demo data is optional and does not complete
   onboarding.

The desktop package includes the Electron app, the bundled local Crewlight CLI
resource used for daemon control, snippet generation, and diagnostics, plus the
desktop UI assets.
Users do not need Node.js, pnpm, Corepack, or the source repository.

## CLI Standalone Artifacts

The Windows standalone artifact is available for advanced usage:

- `crewlight-v0.5.0-windows-x64.zip`

Use them for scripting, hook integration, manual ingest, CI, or daemon-only
workflows.

Linux/macOS remain source-validation targets and do not have v0.5 native
release assets.

## Browser Dashboard

The browser dashboard remains available only when the daemon enables
`--dashboard`, but it is no longer the primary first-run path. Desktop users do
not need to open it to experience Crewlight.

## Verification

Desktop verification remains a GUI step:

- `Crewlight.exe` launches the main window
- the app can start and stop the local service
- a real Codex-shaped event reaches the local Inbox
- onboarding completes
- the optional demo populates deterministic sessions in Home and Companion
- the floating companion can be shown from the desktop app
- Claude Code and Codex fixed paths are inspected read-only; no automatic config
  write occurs
- no raw work content is retained or exposed

CLI standalone verification remains covered by the existing standalone smoke
tests and Windows CI job.
