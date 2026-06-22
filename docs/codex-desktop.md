# Codex Desktop Experimental Surface

Codex Desktop support is `experimental`. Crewlight does not provide a separate
Desktop adapter; it reuses the existing Codex hooks adapter:

```text
source = codex
surface = unknown | cli | desktop
```

Direct `crewlight ingest codex-hook` defaults to `surface=unknown`. The setup
command defaults to `surface=cli` because Codex CLI is the verified path and
that default preserves existing CLI session identity:

```bash
crewlight setup codex-hooks --print
```

For an explicit Desktop experiment, print a separate snippet:

```bash
crewlight setup codex-hooks --print --surface desktop
```

Use the Desktop form only during local verification. It does not claim official
Crewlight support for Codex Desktop.

Official Codex documentation says app agents inherit the same configuration as
the IDE and CLI extension, and the app includes a hooks trust review flow.
Crewlight has not yet verified that real Desktop threads emit the same hook
events and payloads as Codex CLI.

## Manual verification checklist

1. Start the Crewlight daemon and dashboard.
2. Install the generated Codex hooks in a trusted config layer.
3. Review and trust the exact hook commands in Codex.
4. Open Codex Desktop on the same repository.
5. Trigger a minimal prompt.
6. Confirm the dashboard receives an event with `surface=desktop`.
7. Confirm no hook is reported as failed.
8. Compare session ID, cwd, and sanitized payload shape with Codex CLI.

Do not upgrade this surface from `experimental` until that real test passes.
