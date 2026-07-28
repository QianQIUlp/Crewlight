# Qoder integration (experimental)

Crewlight observes an allowlisted subset of Qoder hook fields. It does not retain prompts, transcripts, tool input, tool output, or complete hook payloads.

## Configure

Print a mergeable hook block:

```bash
crewlight setup qoder --print
```

Crewlight only prints the JSON. It does not read or modify Qoder settings. Merge the generated `hooks` object into one of these files while preserving existing hook groups:

- `~/.qoder/settings.json` for user-level hooks
- `<project>/.qoder/settings.json` for shared project hooks
- `<project>/.qoder/settings.local.json` for local project hooks

Qoder merges hooks from these scopes. Restart the IDE or CLI after editing the files because hook configuration is not hot-reloaded.

The generated block uses Qoder's nested command-hook format:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "<generated Crewlight ingest command>"
          }
        ]
      }
    ]
  }
}
```

Crewlight generates handlers for `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, and `Stop`. Tool events use the `*` matcher. It does not generate the unsupported `SessionStart` or `StopFailure` entries from older examples.

The default output embeds the current Crewlight executable path. Use `--binary crewlight` only when Qoder can reliably resolve `crewlight` from `PATH`.

## Verify

Start the daemon, restart Qoder, and complete a real turn:

```bash
crewlight daemon --notifier console
```

The adapter smoke test printed by `crewlight setup` checks only Crewlight's parser and daemon ingest path. It does not prove that Qoder loaded or executed the hook configuration.
