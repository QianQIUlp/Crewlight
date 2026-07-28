# Pi Agent parser status (setup unavailable)

Crewlight contains an experimental Pi Agent payload parser, but it does not yet provide a verified Pi Agent integration extension.

> [!WARNING]
> `crewlight setup pi-agent --print` is intentionally disabled and returns a non-zero exit code. Crewlight does not emit the legacy draft because it is not a valid, verified Pi TypeScript extension.

## Current scope

The current implementation can parse allowlisted synthetic hook payloads sent directly to:

```bash
crewlight ingest pi-agent
```

The setup command reports the missing bridge and does not print a configuration or synthetic smoke command:

```bash
crewlight setup pi-agent --print
```

The ingest parser remains available only for development of a future Pi-specific bridge. Direct synthetic ingest does not install or load an extension, register lifecycle callbacks, or verify end-to-end host behavior.

## Production use

Pi integrations are implemented as TypeScript extensions. Crewlight needs a dedicated extension bridge and a verified event mapping before this adapter can be installed safely.

Until that bridge exists, keep this adapter limited to parser and bridge development. Crewlight does not provide an installable Pi Agent setup snippet.
