# OpenClaw parser status (setup unavailable)

Crewlight contains an experimental OpenClaw payload parser, but it does not yet provide a verified OpenClaw hook or plugin bridge.

> [!WARNING]
> `crewlight setup openclaw --print` is intentionally disabled and returns a non-zero exit code. Crewlight does not emit the legacy draft because it does not implement OpenClaw's `HOOK.md` plus handler or plugin contract.

## Current scope

The current implementation can parse allowlisted synthetic hook payloads sent directly to:

```bash
crewlight ingest openclaw
```

The setup command reports the missing bridge and does not print a configuration or synthetic smoke command:

```bash
crewlight setup openclaw --print
```

The ingest parser remains available only for development of a future OpenClaw-specific bridge. Direct synthetic ingest does not create a `HOOK.md`, install a handler or plugin, or verify end-to-end host behavior.

## Production use

OpenClaw integrations require the platform's hook package or plugin structure rather than the external nested JSON command-hook shape currently emitted by Crewlight. A dedicated bridge and a verified lifecycle contract are required before this adapter can be installed safely.

Until that bridge exists, keep this adapter limited to parser and bridge development. Crewlight does not provide an installable OpenClaw setup snippet.
