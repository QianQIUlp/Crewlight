# Reasonix CLI parser status (setup unavailable)

Crewlight contains an experimental Reasonix CLI payload parser, but its setup contract has not yet been verified against a supported Reasonix external-hook schema.

> [!WARNING]
> `crewlight setup reasonix-cli --print` is intentionally disabled and returns a non-zero exit code. Crewlight has no verified external command-hook contract for Reasonix CLI and does not emit its legacy draft configuration.

## Current scope

The current implementation can parse allowlisted synthetic hook payloads sent directly to:

```bash
crewlight ingest reasonix-cli
```

The setup command reports the missing bridge and does not print a configuration or synthetic smoke command:

```bash
crewlight setup reasonix-cli --print
```

The ingest parser remains available only for development of a future Reasonix-specific bridge. Direct synthetic ingest does not prove that Reasonix accepts a schema, loaded a hook, or executed an end-to-end lifecycle event.

## Production use

Crewlight needs a dedicated bridge based on a verified Reasonix external-hook configuration and event contract before this adapter can be installed safely.

Until that contract is implemented and tested, keep this adapter limited to parser and bridge development. Crewlight does not provide an installable Reasonix setup snippet.
