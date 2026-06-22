# Antigravity Research Probe

Antigravity CLI and Desktop support is `research-only`. Crewlight does not
provide a stable Antigravity adapter or setup command.

The following command is diagnostic scaffolding for controlled experiments:

```bash
crewlight ingest antigravity-probe \
  --event <observed-event-name> \
  --surface unknown
```

It accepts optional JSON on stdin and only forwards a whitelisted event name,
session ID, cwd, timestamp, and selected surface. The emitted status is always
`unknown`. Invalid or missing stdin, malformed arguments, and daemon failures
all exit zero with empty stdout and stderr.

Google has published a technical documentation entry point and a
[hooks URL](https://antigravity.google/docs/hooks), but Crewlight has not
verified readable page content, a hooks configuration shape, payload schema,
command execution behavior, or shared CLI/Desktop runtime behavior. Do not use
the probe as a stable integration.

## Local experiment checklist

1. Locate Antigravity configuration directories.
2. Search documented settings for hooks, plugins, skills, and customization.
3. Create a temporary hook or plugin only if the installed product documents
   and permits it.
4. Record only sanitized stdin field names, argv shape, cwd, and non-secret
   environment metadata.
5. Test Antigravity CLI.
6. Test Antigravity Desktop.
7. Compare whether CLI and Desktop share config and runtime behavior.
8. Never print or store tokens, auth files, prompts, transcripts, tool
   input/output, or file contents.
9. Document the verified support boundary before implementing stable setup.

The probe is intentionally generic because no Antigravity hook contract has
been verified by Crewlight.
