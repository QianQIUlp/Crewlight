# Qwen Code Integration Guide (Experimental)

Crewlight observes Qwen Code through its documented command hooks and keeps only allowlisted status, identity, location, and short descriptive fields.

## Setup

Print a mergeable JSON fragment:

```bash
crewlight setup qwen-code --print
```

Merge the generated `hooks` object into the relevant Qwen Code settings file, such as project-level `.qwen/settings.json`, while preserving existing hook groups.

The fragment uses Qwen Code's documented PascalCase events, including `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `StopFailure`, and `Notification`. It does not use the unsupported synthetic names `start`, `tool_use`, `finish`, or `error`. Only the safe `StopFailure.error` enum is used to distinguish rate limiting from other failures; detailed error text and assistant output are discarded.

## Verify

1. Start `crewlight daemon --notifier console`.
2. Run the printed adapter smoke test. This checks only Crewlight's ingest path.
3. Start a fresh Qwen Code session, invoke a tool, and complete a turn. Confirm those real events appear in Crewlight.

The smoke test does not prove that Qwen Code loaded the settings file.
