# AgentPulse

AgentPulse is a universal local activity hub for AI coding agents. It collects
events from adapters, wrappers, and manual callers, normalizes them into one
status model, aggregates sessions in a local daemon, and sends actionable
events to notifier outputs.

v0.1 focuses on the event bus, session model, local daemon, CLI, console
notifier, and a best-effort generic command wrapper.

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

The link exposes the `agentpulse` executable from the built CLI package. Run
`pnpm build` again after changing TypeScript source.

## Quick start

Start the daemon in one terminal:

```bash
agentpulse daemon
```

Send manual events from another terminal:

```bash
agentpulse emit \
  --source custom \
  --surface manual \
  --status running \
  --session-id demo \
  --message "test running"

agentpulse emit \
  --source custom \
  --surface manual \
  --status completed \
  --session-id demo \
  --message "test completed"
```

Inspect all sessions observed during the current daemon process:

```bash
agentpulse status
agentpulse status --json
```

Wrap a command:

```bash
agentpulse run --source generic-cli -- npm test
```

The wrapper reports `running` after a successful spawn, `completed` for exit
code zero, and `failed` for a non-zero exit code, signal, or spawn error. It
preserves the wrapped command's exit result. If the daemon is unavailable, the
wrapper prints a warning and still runs the command.

## Configuration

The daemon defaults to `127.0.0.1:3768`.

```bash
AGENTPULSE_HOST=127.0.0.1
AGENTPULSE_PORT=3768
```

The same environment variables configure CLI connections. Binding beyond
loopback is only appropriate for a trusted development environment because
v0.1 has no authentication.

## Architecture

```text
hook / plugin / wrapper / manual emit
                  |
                  v
               adapter
                  |
                  v
          normalized event
                  |
                  v
              daemon
             /      \
      session store  notifier
```

- `sessionId` is the optional original identifier supplied by a platform or
  adapter.
- `sessionKey` is an AgentPulse-owned, namespaced and hashed aggregation key.
- `rawEvent` exists only at the input boundary and is discarded during
  normalization. It is never stored, returned, or printed.
- All sessions, including completed and failed sessions, remain in memory until
  the daemon exits. v0.1 has no persistence or session cleanup.

See [architecture](docs/architecture.md),
[integration boundaries](docs/integration-boundaries.md), and the
[v0.1 plan](docs/mvp-plan.md) for details.

## Integration levels

- **Precise:** documented platform hooks or plugin APIs.
- **Best-effort:** wrappers, watchers, or other incomplete observation points.
- **Manual:** explicit `agentpulse emit` calls.

Only the generic CLI best-effort wrapper and manual emit path ship in v0.1.
Claude Code, Codex, OpenCode, Cursor, and VS Code adapters are not yet
implemented or claimed as supported.

## Development

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For end-to-end verification without a global link, replace `agentpulse` with:

```bash
node packages/cli/dist/index.js
```

Verify the complete loop:

```bash
node packages/cli/dist/index.js daemon
node packages/cli/dist/index.js emit --source custom --surface manual --status running --session-id verify --message "running"
node packages/cli/dist/index.js emit --source custom --surface manual --status completed --session-id verify --message "completed"
node packages/cli/dist/index.js status --json
node packages/cli/dist/index.js run --source generic-cli -- node -e "process.exit(0)"
node packages/cli/dist/index.js run --source generic-cli -- node -e "process.exit(7)"
```

## v0.1 scope boundaries

v0.1 does not include a desktop app, IDE extension, platform-specific adapter,
persistent storage, SSE/WebSocket broadcasting, OS notifications, session
garbage collection, OCR, UI automation, or private API reverse engineering.

## License

MIT
