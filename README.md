# AgentPulse

AgentPulse is a local activity hub for AI coding agents. Platform adapters
translate lifecycle events into one normalized model, a local daemon aggregates
sessions, and notifier outputs surface states that need attention.

v0.2 adds precise Claude Code hooks, the narrow official Codex CLI notify
integration, and optional OS notifications. The v0.1 manual emit and generic
command wrapper remain supported.

## Requirements

- Node.js 22 or newer
- pnpm 10.11.0

## Setup

```bash
corepack enable
pnpm install
pnpm build
cd packages/cli
npm link
cd ../..
```

The link exposes the built `agentpulse` executable. Run `pnpm build` after
changing TypeScript source.

## Quick start

Start the daemon with the default console notifier:

```bash
agentpulse daemon
```

Select a notifier with a flag or environment variable:

```bash
agentpulse daemon --notifier os
agentpulse daemon --notifier none
AGENTPULSE_NOTIFIER=os agentpulse daemon
```

Supported kinds are `console`, `os`, and `none`; the default is `console`. If
native OS notification support is unavailable, AgentPulse prints a warning and
continues running.

Send and inspect manual events:

```bash
agentpulse emit \
  --source custom \
  --surface manual \
  --status completed \
  --session-id demo \
  --message "done"

agentpulse status
agentpulse status --json
```

Wrap a command with the best-effort generic adapter:

```bash
agentpulse run --source generic-cli -- npm test
```

The wrapper preserves the command's exit result. Daemon delivery failures warn
without preventing the command from running.

## Platform setup

Print a Claude Code hooks snippet:

```bash
agentpulse setup claude-code --print
```

Print a Codex user-config snippet:

```bash
agentpulse setup codex --print
```

These commands only print snippets. They never read, overwrite, or modify user
configuration. Manually merge the output with existing settings:

- [Claude Code setup](docs/setup-claude-code.md)
- [Codex setup](docs/setup-codex.md)

The platform ingest commands are intended to be called by those integrations:

```bash
echo '{"session_id":"claude-demo","cwd":"/tmp/demo","hook_event_name":"Stop","last_assistant_message":"Done"}' \
  | agentpulse ingest claude-code

agentpulse ingest codex \
  '{"type":"agent-turn-complete","thread-id":"codex-demo","turn-id":"turn-1","cwd":"/tmp/demo","last-assistant-message":"Done"}'
```

Ingest commands intentionally return zero after malformed input, unsupported
events, or daemon connection failures so they do not interrupt the host
platform.

## Configuration

The daemon defaults to `127.0.0.1:3768`.

```bash
AGENTPULSE_HOST=127.0.0.1
AGENTPULSE_PORT=3768
AGENTPULSE_NOTIFIER=console
```

CLI connections use the same host and port variables. A `--notifier` daemon
flag overrides `AGENTPULSE_NOTIFIER`. Binding beyond loopback is only
appropriate for a trusted development environment because AgentPulse has no
authentication.

## Architecture

```text
Claude hook / Codex notify / wrapper / manual emit
                        |
                        v
                     adapter
                        |
                        v
                AgentEventInput
                        |
                        v
                     daemon
                    /      \
             session store  console / OS / none
```

- `sessionId` is the optional original identifier supplied by a platform.
- `sessionKey` is an AgentPulse-owned, namespaced and hashed aggregation key.
- Adapters whitelist output fields. Complete platform payloads are never
  forwarded as `rawEvent`.
- Sessions remain in memory until the daemon exits; v0.2 has no persistence or
  session cleanup.

See [architecture](docs/architecture.md),
[integration boundaries](docs/integration-boundaries.md), and the
[v0.2 platform adapter guide](docs/v0.2-platform-adapters.md).

## Integration levels

- **Precise:** Claude Code uses documented lifecycle hooks.
- **Narrow official:** Codex uses the documented external `notify` command and
  supports only `agent-turn-complete`.
- **Best-effort:** the generic CLI wrapper observes only the command it starts.
- **Manual:** callers explicitly submit normalized events.

AgentPulse v0.2 does not claim Codex running, input-waiting, or permission
states.

## Development

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For local end-to-end verification without a global link, use:

```bash
node packages/cli/dist/index.js
```

## v0.2 scope boundaries

v0.2 does not include OpenCode or Cursor adapters, a VS Code extension, a
desktop application, Tauri or Electron, persistence, SSE/WebSocket, session
garbage collection, hardware output, automatic user-config mutation, OCR,
screen scraping, window watching, or private API reverse engineering.

## License

MIT
