# v0.2.1 Dogfood Report

This report separates evidence by verification method. Do not promote an item
to **verified manually** unless the full workflow was exercised in a suitable
local environment.

## Verification status

| Workflow                    | Status                                            | Evidence                                                                                                   |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Claude Code hook ingest     | Verified manually, automatically, and by fixture  | A real Claude Code `Stop` hook reached the daemon; sanitized fixture and adapter/CLI tests cover mapping.  |
| Codex CLI notify ingest     | Verified manually, automatically, and by fixture  | A real Codex `agent-turn-complete` notify reached the daemon; fixture and adapter/CLI tests cover mapping. |
| Daemon startup              | Verified manually and by automated tests          | Console and OS modes started on loopback; server/configuration tests cover startup behavior.               |
| Console notifier            | Verified manually and by automated tests          | Real and synthetic terminal events appeared in daemon output; unit tests cover policy.                     |
| OS notifier                 | Not verified / requires local desktop environment | The module loaded, but the Codespace callback reported delivery failure; no visible desktop was present.   |
| OS notifier fallback        | Verified manually and by automated tests          | The OS failure warned without losing the event; restarting in console mode produced output.                |
| Setup snippet generation    | Verified manually and by automated tests          | Smoke tests confirmed raw stdout snippets and separate non-mutating stderr guidance.                       |
| Daemon unreachable behavior | Verified manually and by automated tests          | Human and JSON doctor returned non-zero; ingest tests verify non-blocking host behavior.                   |

## Verified manually

Record the exact environment, command, observed output, and date. A synthetic
payload is not a real Claude Code or Codex workflow.

- Environment: GitHub Codespace, Linux x86_64, Node.js 22.16.0, pnpm 10.11.0,
  June 19, 2026.
- Claude Code version: 2.1.183. A print-mode turn used a temporary `--settings`
  file and `--no-session-persistence`; its real `Stop` payload produced a
  `claude-code completed` console notification and session.
- Codex CLI version: 0.141.0. An `exec --ephemeral --ignore-user-config` turn
  used a one-run `notify` override; its real `agent-turn-complete` payload
  produced a `codex completed` console notification and session.
- Daemon diagnostics: offline human and JSON doctor returned exit code 1 with
  recovery instructions; both returned success after the console daemon
  started.
- OS notifier: the module/interface probe passed, but actual delivery returned
  a callback failure in the headless Codespace. The event remained available
  through `status`, and console fallback was then verified.

## Verified by automated tests

- Claude and Codex adapter mappings, malformed input, unsupported events, and
  private-field exclusion.
- CLI ingest behavior, setup snippet output/guidance, doctor status and exit
  codes, daemon-unreachable warnings, and port-conflict recovery text.
- Console and OS notifier policies, OS module probe, and safe warning fallback.
- v0.1 manual emit, status, and generic command wrapper behavior.

## Verified by fixture tests

The repository stores sanitized representative fixtures only:

- `packages/adapters/claude-code/test/fixtures/stop.sanitized.json`
- `packages/adapters/codex/test/fixtures/agent-turn-complete.sanitized.json`

Fixture tests assert only normalized public fields. Prompts, tool input,
transcript paths, complete platform payloads, and `rawEvent` do not propagate to
events, sessions, notifier output, or daemon responses.

## Not verified / requires local environment

- Whether a desktop notification is visibly delivered by the current OS,
  desktop session, notification service, and permissions.
- OS behavior outside the environment recorded under **Verified manually**.
- Existing user configurations with custom hook dispatchers or multiple
  notifier integrations.
- Visible OS notification delivery on Windows, macOS, or a Linux graphical
  desktop.

## Manual verification procedure

### 1. Start and diagnose the daemon

```bash
crewlight doctor
crewlight daemon --notifier console
```

Run `crewlight doctor` again in another terminal. It should report the daemon
as reachable.

### 2. Claude Code hook ingest

Print and manually merge the snippet:

```bash
crewlight setup claude-code --print
```

In Claude Code, use `/hooks` to confirm the handlers, complete a small turn, and
then inspect:

```bash
crewlight status --json
```

The console daemon should print the terminal event and status should include a
`claude-code` session.

### 3. Codex CLI notify ingest

Print and manually merge the user-level snippet:

```bash
crewlight setup codex --print
```

Complete one Codex CLI turn and run `crewlight status --json`. The daemon
should print a `codex completed` event and status should include a `codex`
session.

### 4. OS notifier and fallback

```bash
crewlight doctor --notifier os
crewlight daemon --notifier os
```

Trigger a terminal event. If no desktop notification appears or Crewlight
prints an OS notifier warning, confirm ingest still works with
`crewlight status --json`, then restart with:

```bash
crewlight daemon --notifier console
```
