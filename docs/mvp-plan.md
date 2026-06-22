# Crewlight MVP Plan

## v0.1 foundation

v0.1 established the normalized event model, in-memory session store, local
daemon, console notifier, manual emit path, status command, and generic CLI
wrapper.

Those interfaces remain compatible in v0.2:

```bash
crewlight daemon
crewlight emit --source custom --surface manual --status running
crewlight status
crewlight run --source generic-cli -- node -e "process.exit(0)"
```

## v0.2 goal

Validate the complete real-platform path:

```text
documented lifecycle event
        -> platform adapter
        -> AgentEventInput
        -> daemon
        -> session store + selected notifier
```

Included:

- Claude Code command-hook adapter;
- Codex CLI external notify adapter for turn completion;
- platform ingest and setup snippet commands;
- optional OS notifier with contained failure handling;
- documentation and regression coverage.

## Acceptance criteria

- Claude Code hook JSON can create supported session state through stdin.
- Codex `agent-turn-complete` JSON creates a completed session.
- Unknown or malformed platform input does not interrupt the host process.
- Claude `SessionEnd` cannot replace a useful terminal state.
- OS notification failures cannot prevent daemon startup or event ingestion.
- Setup commands print snippets without reading or modifying user config.
- All v0.1 commands remain functional.
- Format, typecheck, tests, and build pass.

## Excluded

- OpenCode and Cursor adapters;
- VS Code or other IDE extensions;
- desktop, tray, or floating-window applications;
- automatic user configuration mutation;
- persistence, restart recovery, retention, or session cleanup;
- SSE, WebSocket, webhooks, mobile push, or hardware output;
- OCR, screen scraping, UI automation, or private API reverse engineering.
