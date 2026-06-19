# Set up Claude Code

Claude Code command hooks send JSON to AgentPulse through stdin.

## Print the snippet

```bash
agentpulse setup claude-code --print
```

The command prints a JSON snippet. It does not inspect or modify
`~/.claude/settings.json`, `.claude/settings.json`, or any other Claude
configuration.

## Merge it manually

Copy the printed `hooks` entries into the appropriate existing Claude settings
file. Treat the output as a fragment, not a complete replacement file:

- preserve unrelated settings;
- preserve existing handlers under the same hook event;
- append the AgentPulse command to existing `hooks` arrays;
- validate the final JSON before restarting Claude Code.

The snippet registers:

- `SessionStart`
- `UserPromptSubmit`
- `Notification`
- `PermissionRequest`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `StopFailure`

It intentionally does not register `SessionEnd`. AgentPulse v0.2 ignores that
event to avoid replacing `completed`, `failed`, or `rate_limited` with `idle`.

The command hook does not return a permission decision. Delivery failures only
produce a warning and return zero, so AgentPulse does not block Claude Code or
change its permission behavior.

## Verify

With the AgentPulse daemon running:

```bash
echo '{"session_id":"claude-demo","cwd":"/tmp/demo","hook_event_name":"Stop","last_assistant_message":"Done"}' \
  | agentpulse ingest claude-code

agentpulse status --json
```

The resulting session should have source `claude-code` and status `completed`.

For the upstream event definitions, see the
[Claude Code hooks reference](https://code.claude.com/docs/en/hooks).
