# Install Crewlight Without Node.js

Crewlight v0.4.0 is desktop-first on Windows. The primary ordinary-user path is
the portable Windows desktop app, with the unsigned installer as a secondary
convenience artifact.

## Windows Desktop

Primary download:

- `crewlight-v0.4.0-windows-x64-desktop.zip`

Secondary installer:

- `Crewlight-Setup-v0.4.0.exe`

Portable desktop flow:

1. Extract `crewlight-v0.4.0-windows-x64-desktop.zip`
2. Open the extracted folder
3. Double-click `Crewlight.exe`
4. Use the onboarding flow to start the local service, run the demo, and show
   the companion

The desktop package includes the Electron app, the bundled local Crewlight CLI
resource used for daemon control and setup actions, and the desktop UI assets.
Users do not need Node.js, pnpm, Corepack, or the source repository.

## CLI Standalone Artifacts

The CLI artifacts still exist for advanced usage:

- `crewlight-v0.4.0-linux-x64.tar.gz`
- `crewlight-v0.4.0-windows-x64.zip`

Use them for scripting, hook integration, manual ingest, CI, or daemon-only
workflows.

## Browser Dashboard

The browser dashboard remains available only when the daemon enables
`--dashboard`, but it is no longer the primary first-run path. Desktop users do
not need to open it to experience Crewlight.

## Verification

Desktop verification remains a GUI step:

- `Crewlight.exe` launches the main window
- the app can start, stop, and restart the local service
- the demo populates Home, Demo, and Companion
- the floating companion can be shown from the desktop app

CLI standalone verification remains covered by the existing standalone smoke
tests and Windows CI job.
