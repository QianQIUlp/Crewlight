# CodeBuddy integration (experimental)

Crewlight observes an allowlisted subset of CodeBuddy hook fields. It does not retain prompts, transcripts, tool input, tool output, or complete hook payloads.

## Configure

Print a mergeable hook block:

```bash
crewlight setup codebuddy --print
```

Crewlight only prints the JSON. It does not read or modify CodeBuddy settings. Merge the generated `hooks` object into one of these files while preserving existing hook groups:

- `~/.codebuddy/settings.json` for user-level hooks
- `<project>/.codebuddy/settings.json` for shared project hooks
- `<project>/.codebuddy/settings.local.json` for local project hooks

The generated block uses CodeBuddy's nested command-hook format:

```json
{
  "hooks": {
    "SessionStart": [
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

Crewlight generates handlers for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `PermissionRequest`, `Stop`, `StopFailure`, and `SessionEnd`. Tool events use the `*` matcher.

The default output embeds the current Crewlight executable path. Use `--binary crewlight` only when CodeBuddy can reliably resolve `crewlight` from `PATH`.

## Verify

Start the daemon, inspect CodeBuddy's `/hooks` panel, and complete a real turn:

```bash
crewlight daemon --notifier console
```

The adapter smoke test printed by `crewlight setup` checks only Crewlight's parser and daemon ingest path. It does not prove that CodeBuddy loaded or executed the hook configuration.
