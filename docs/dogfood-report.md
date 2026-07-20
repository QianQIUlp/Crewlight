# v0.5.0 Dogfood Report

This report separates evidence by verification method. Do not promote an item to **verified manually** unless the full workflow was exercised in a suitable local environment.

## Verification status

| Workflow                   | Status                                            | Evidence                                                                                                   |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Claude Code hook ingest    | Verified manually, automatically, and by fixture  | A real Claude Code `Stop` hook reached the daemon; sanitized fixture and adapter/CLI tests cover mapping.  |
| Codex CLI notify ingest    | Verified manually, automatically, and by fixture  | A real Codex `agent-turn-complete` notify reached the daemon; fixture and adapter/CLI tests cover mapping. |
| Gemini / Copilot / agy     | Verified manually and by automated tests          | Gemini CLI, Copilot CLI, and Antigravity (agy) hooks translate to local dashboard status.                  |
| 12 Longtail Adapters       | Verified automatically by test suite              | Codebuddy, Kiro, Kimi, Qwen, Codewhale, Mimo, Pi, Openclaw, Hermes, Qoder, Qoderwork, Reasonix tests pass. |
| SSH Remote Tunneling       | Verified manually and by automated tests          | Config parsing, port-forward mapping, connection heartbeats, retry limits, and CLI check verification.     |
| Daemon startup             | Verified manually and by automated tests          | Console and OS modes started on loopback; server/configuration tests cover startup behavior.               |
| Console notifier           | Verified manually and by automated tests          | Real and synthetic terminal events appeared in daemon output; unit tests cover policy.                     |
| OS notifier                | Not verified / requires local desktop environment | The module loaded, but the headless environments report delivery failure.                                  |
| Setup snippet generation   | Verified manually and by automated tests          | Setup prints valid config JSONs and verification scripts for all 20 active adapters.                       |
| Theme/Accent customization | Verified manually and by automated tests          | Settings panel persists theme, accent color, and density tokens to local preference store.                 |

## Verified manually

Record the exact environment, command, observed output, and date.

- **Environment**: Linux x86_64, Node.js 22.16.0, pnpm 10.11.0, July 20, 2026.
- **Claude Code version**: 2.1.183. Verified that setup commands print clean JSON configuration. Session states successfully sync with the companion.
- **Gemini CLI / Copilot CLI**: Verified `crewlight setup gemini-cli --print` and `crewlight setup copilot-cli --print` emit correct hook structures.
- **SSH Remote Tunneling**: Setup configuration annotated with `# CrewlightRemote: yes` in `~/.ssh/config` is successfully parsed. Host connection attempts route to proxy servers, check for remote CLI, and lazy-initialize tunnels on 127.0.0.1:3768.
- **Desktop Preferences**: Verified light/dark/system theme settings toggle HTML `data-theme` attribute correctly and persist values across reboots.

## Verified by automated tests

- All 20 adapters (Claude, Codex, Gemini CLI, Copilot CLI, Antigravity, and the 12 longtail adapters) map correctly under `packages/adapters/*/test/*.test.ts`.
- Data leak prevention asserts that prompt parameters, transcripts, and inputs are never propagated to normalized structures.
- SSH config parser logic, SSH tunnel connection states, retry limitations, port forwarding failures, and heartbeats.
- Preferences store serialization, sanitization, default boundaries, and remote host mappings.

## Verified by fixture tests

Sanitized representative fixtures are checked for:

- `packages/adapters/claude-code/test/fixtures/stop.sanitized.json`
- `packages/adapters/codex/test/fixtures/agent-turn-complete.sanitized.json`

## Manual verification procedure

### 1. Diagnose and Verify Local Subcommands

```bash
crewlight doctor
crewlight setup gemini-cli --print
crewlight setup copilot-cli --print
crewlight setup codebuddy --print
```

### 2. Verify Remote Config Scanning

Annotate a host in `~/.ssh/config`:

```text
Host my-remote-box
  HostName 192.168.1.100
  User root
  # CrewlightRemote: yes
```

Launch Crewlight Desktop and verify `my-remote-box` is scanned and listed under the Remote settings tab.
