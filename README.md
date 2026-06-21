# AgentPulse

AgentPulse is a local activity hub for AI coding agents. It receives supported
Claude Code and Codex events, an OpenCode plugin MVP, generic CLI observations,
research probes, and manual events. It aggregates them into in-memory sessions
and exposes their current state through notifications, CLI commands, and an
optional browser dashboard.

## Quick Start

The recommended user installation is a standalone Linux x64 or Windows x64
release binary. It does not require Node.js, npm, or pnpm.

1. Download the archive and matching `.sha256` file from
   [GitHub Releases](https://github.com/QianQIUlp/AgentPulse/releases):

   - Linux: `agentpulse-v0.2.3-linux-x64.tar.gz`
   - Windows: `agentpulse-v0.2.3-windows-x64.zip`

2. Verify and extract it.

   Linux:

   ```bash
   sha256sum --check agentpulse-v0.2.3-linux-x64.tar.gz.sha256
   tar -xzf agentpulse-v0.2.3-linux-x64.tar.gz
   cd agentpulse-v0.2.3-linux-x64
   ```

   Windows PowerShell:

   ```powershell
   $expected = (Get-Content .\agentpulse-v0.2.3-windows-x64.zip.sha256).Split()[0]
   $actual = (Get-FileHash .\agentpulse-v0.2.3-windows-x64.zip -Algorithm SHA256).Hash
   if ($actual.ToLower() -ne $expected.ToLower()) { throw "Checksum mismatch" }
   Expand-Archive .\agentpulse-v0.2.3-windows-x64.zip -DestinationPath .\agentpulse-v0.2.3-windows-x64
   Set-Location .\agentpulse-v0.2.3-windows-x64
   ```

3. Start the daemon and dashboard with `./agentpulse daemon --dashboard` on
   Linux or `.\agentpulse.exe daemon --dashboard` on Windows.

   ```bash
   ./agentpulse daemon --dashboard
   ```

4. Open the printed local URL, normally
   `http://127.0.0.1:3768/dashboard`.

The dashboard is read-only, opt-in, and restricted to loopback. It shows daemon
health, notifier mode, current in-memory sessions, setup snippets, and basic
doctor output. See [install without Node](docs/install-without-node.md) and the
[dashboard guide](docs/dashboard.md).

### Standalone platform status

| Platform    | v0.2.3 status                                         |
| ----------- | ----------------------------------------------------- |
| Linux x64   | Supported and verified by CI standalone smoke tests   |
| Windows x64 | Newly verified in v0.2.3 by CI standalone smoke tests |
| macOS       | Planned / unverified; no supported binary is claimed  |

Commands below use `agentpulse` on `PATH`. When running directly from the
extracted archive, replace it with `./agentpulse`.

## Check the Installation

With the daemon running in one terminal:

```bash
./agentpulse doctor
./agentpulse doctor --json
```

For a standalone binary, doctor reports that pnpm and source-build checks are
not required. The archive's `BUILD-INFO.txt` records the exact Node 22.x runtime
used to build that artifact, its commit, platform, and architecture.

## Platform Setup

Print a Claude Code hooks snippet:

```bash
agentpulse setup claude-code --print
```

Print a Codex user-config snippet:

```bash
agentpulse setup codex --print
```

Print a Codex lifecycle hooks snippet:

```bash
agentpulse setup codex-hooks --print
```

Print an OpenCode local plugin:

```bash
agentpulse setup opencode --print
```

These commands only print mergeable snippets. They never read or modify user
configuration. By default they include the absolute current standalone binary
path, or the absolute Node executable plus CLI entry path for source mode. Use
`--binary agentpulse` only to explicitly select PATH mode. Follow the
platform-specific merge instructions:

- [Claude Code setup](docs/setup-claude-code.md)
- [Codex notify setup](docs/setup-codex.md)
- [Codex hooks setup](docs/setup-codex-hooks.md)
- [OpenCode plugin MVP](docs/opencode.md)

The ingest commands are intended to be called by those integrations. Hook-style
OpenCode and Codex lifecycle ingest remains silent and non-blocking even for
malformed input or daemon failures.

## CLI Usage

Select a notifier when starting the daemon:

```bash
agentpulse daemon --notifier console
agentpulse daemon --notifier os
agentpulse daemon --notifier none
AGENTPULSE_NOTIFIER=os agentpulse daemon
```

Supported notifier modes are `console`, `os`, and `none`; the default is
`console`. On Linux, OS notification mode requires a working graphical session
and the system `notify-send` command. Notification failures never stop event
ingestion.

Send and inspect a manual event:

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

## Configuration

The daemon defaults to `127.0.0.1:3768`.

```bash
AGENTPULSE_HOST=127.0.0.1
AGENTPULSE_PORT=3768
AGENTPULSE_NOTIFIER=console
```

CLI connections use the same host and port variables. Binding the daemon beyond
loopback remains available only for trusted development environments because
the HTTP API has no authentication. `--dashboard` rejects every host except
`127.0.0.1` and `::1`.

## Developer Setup

Source builds are the developer path and require:

- Node.js 22 or newer
- pnpm 10.11.0

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
cd packages/cli
npm link
cd ../..
```

The normal development output remains TypeScript-compiled ESM. The CommonJS
bundle used for Node SEA is generated only by the release-specific command:

```bash
pnpm build:standalone
pnpm smoke:standalone
```

Run repository validation with:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

For local use without a global link:

```bash
node packages/cli/dist/index.js
```

## Architecture and Safety

```text
Claude hook / Codex notify or hooks / wrapper / manual emit
                        |
                        v
                     adapter
                        |
                        v
                AgentEventInput
                        |
                        v
                     daemon
             /          |          \
       session store  dashboard  console / OS / none
```

- `sessionId` is the optional original identifier supplied by a platform.
- `sessionKey` is an AgentPulse-owned, namespaced and hashed aggregation key.
- Adapters whitelist output fields. Complete platform payloads, prompts,
  transcripts, and tool input/output are never forwarded into normalized
  events or dashboard responses.
- Sessions remain in memory until the daemon exits. There is no persistence,
  history recovery, or session cleanup.
- The dashboard polls ordinary HTTP endpoints; there is no SSE or WebSocket.

See [architecture](docs/architecture.md),
[integration boundaries](docs/integration-boundaries.md), the
[v0.2 platform adapter guide](docs/v0.2-platform-adapters.md), and
[troubleshooting](docs/troubleshooting.md).

## Integration Levels

- **Precise:** Claude Code uses documented lifecycle hooks.
- **Precise lifecycle:** Codex hooks map documented session, prompt, tool,
  permission, and stop events after the user reviews and trusts the commands.
- **Narrow official notify:** Codex `notify` remains available for
  `agent-turn-complete`.
- **Implemented, verification pending:** OpenCode uses documented local plugin
  events but still requires a real local verification before a supported label.
- **Experimental:** Codex Desktop reuses Codex hooks with an explicit surface.
- **Research-only:** Antigravity exposes only a sanitized probe command.
- **Best-effort:** the generic CLI wrapper observes only the command it starts.
- **Manual:** callers explicitly submit normalized events.

Codex hooks are observation-only: AgentPulse never returns permission decisions,
context, updated tool input, or turn-control output.

## v0.2.3 Scope Boundaries

v0.2.3 does not claim verified OpenCode Desktop, Codex Desktop, or Antigravity
support. It also does not include Cursor adapters, a VS Code extension, Tauri,
Electron, a desktop tray, persistence, SSE/WebSocket, session garbage
collection, hardware output, automatic user-config mutation, OCR, screen
scraping, window watching, or private API reverse engineering.

## License

MIT
