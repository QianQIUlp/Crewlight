# QoderWork integration (experimental)

Crewlight observes an allowlisted subset of QoderWork hook fields. It does not retain prompts, transcripts, tool input, tool output, or complete hook payloads.

## Configure

Print a mergeable hook block:

```bash
crewlight setup qoderwork --print
```

Crewlight only prints the JSON. It does not read or modify QoderWork settings. Merge the generated `hooks` object into `~/.qoderwork/settings.json` while preserving existing hook groups, then restart QoderWork. QoderWork does not currently hot-reload hook configuration.

The generated block uses QoderWork's nested command-hook format:

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

Crewlight generates handlers for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`, `PreCompact`, `Stop`, and `SessionEnd`. Events with tool or subagent matchers use `*`. It does not generate the nonexistent `StopFailure` entry from older examples.

The default output embeds the current Crewlight executable path. Use `--binary crewlight` only when QoderWork can reliably resolve `crewlight` from `PATH`.

## Verify

Start the daemon, restart QoderWork, and complete a real turn:

```bash
crewlight daemon --notifier console
```

The adapter smoke test printed by `crewlight setup` checks only Crewlight's parser and daemon ingest path. It does not prove that QoderWork loaded or executed the hook configuration.
