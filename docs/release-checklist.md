# v0.4.0 Release Checklist

Status: **Unreleased**

## Identity and desktop positioning

- [ ] Root and workspace package versions are `0.4.0`
- [ ] CLI help displays `Crewlight v0.4.0`
- [ ] Desktop docs present Crewlight Desktop as the primary user-facing surface
- [ ] Browser dashboard docs describe the dashboard as a secondary developer surface
- [ ] CLI docs describe CLI as the advanced and automation surface
- [ ] README and CHANGELOG include the AgentPulse → Crewlight migration note

## Required artifacts

- [ ] `crewlight-v0.4.0-linux-x64.tar.gz`
- [ ] `crewlight-v0.4.0-windows-x64.zip`
- [ ] `crewlight-v0.4.0-windows-x64-desktop.zip`
- [ ] `Crewlight-Setup-v0.4.0.exe`
- [ ] The desktop zip extracts to a folder containing `Crewlight.exe`

## Validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Windows desktop packaging job passes
- [ ] Windows CLI standalone job passes
- [ ] Linux CLI standalone job passes

## Desktop GUI gate

- [ ] `Crewlight.exe` launches the main desktop shell
- [ ] The desktop app can start, stop, and restart the local service
- [ ] The onboarding flow works end to end
- [ ] The demo populates Home, Demo, and Companion
- [ ] Companion controls work from the main window
- [ ] Settings persist only bounded local UI preferences
- [ ] No prompts, transcripts, tool I/O, raw events, or session history are persisted

## Screenshot gate

- [ ] `assets/readme/crewlight-desktop-overview.png`
- [ ] `assets/readme/crewlight-desktop-agents.png`
- [ ] `assets/readme/crewlight-desktop-demo.png`
- [ ] `assets/readme/crewlight-desktop-companion.png`
- [ ] `assets/readme/companion-expanded-demo.png`
- [ ] Screenshots come from the actual running desktop app in a GUI-capable environment

## Safety

- [ ] Loopback-only dashboard boundary remains intact
- [ ] Cursor remains documented as a manual / experimental bridge
- [ ] Docs do not claim cloud sync, private API scraping, or automatic permission approval
