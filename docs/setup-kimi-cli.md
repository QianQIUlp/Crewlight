# Kimi Code CLI Integration Guide (Experimental)

Crewlight observes Kimi Code CLI through its documented command hooks and keeps only allowlisted status, identity, location, and short descriptive fields.

## Setup

Print a mergeable TOML fragment:

```bash
crewlight setup kimi-cli --print
```

Append the generated `[[hooks]]` entries to `~/.kimi-code/config.toml`. Preserve existing entries; Kimi Code accepts repeated `[[hooks]]` tables rather than a JSON `hooks` object.

The fragment covers the documented lifecycle, tool, permission, and subagent events, including `PreToolUse`, `PostToolUse`, `Stop`, `StopFailure`, and `Interrupt`. Each command receives the Kimi hook payload on stdin and forwards only Crewlight's allowlisted fields. A user interruption is recorded as idle rather than as a successful completion; a `rate_limit` failure remains distinguishable from other failures.

## Verify

1. Start `crewlight daemon --notifier console`.
2. Run the printed adapter smoke test. This checks only Crewlight's ingest path.
3. Start a fresh Kimi Code session, invoke a tool, and complete a turn. Confirm those real events appear in Crewlight.

The smoke test does not prove that Kimi Code loaded the configuration.
