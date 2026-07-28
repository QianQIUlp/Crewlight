# MiMo Code parser status (setup unavailable)

Crewlight contains an experimental MiMo Code payload parser, but it does not yet provide a verified MiMo Code integration bridge.

> [!WARNING]
> `crewlight setup mimo-code --print` is intentionally disabled and returns a non-zero exit code. Crewlight has no verified external command-hook contract for MiMo Code and does not emit its legacy draft configuration.

## Current scope

The current implementation can parse allowlisted synthetic hook payloads sent directly to:

```bash
crewlight ingest mimo-code
```

The setup command reports the missing bridge and does not print a configuration or synthetic smoke command:

```bash
crewlight setup mimo-code --print
```

The ingest parser remains available only for development of a future MiMo-specific bridge. Direct synthetic ingest does not register a MiMo hook or verify end-to-end host behavior.

## Production use

MiMo Code exposes in-process TypeScript/file hooks rather than the external nested JSON command-hook shape currently emitted by Crewlight. A dedicated bridge and a verified lifecycle contract are required before this adapter can be installed safely.

Until that bridge exists, keep this adapter limited to parser and bridge development. Crewlight does not provide an installable MiMo setup snippet.
