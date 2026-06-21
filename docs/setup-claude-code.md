# Set up Claude Code

Claude Code command hooks send JSON to AgentPulse through stdin.

## Print the snippet

```bash
agentpulse setup claude-code --print
```

The command prints a JSON snippet. It does not inspect or modify
`~/.claude/settings.json`, `.claude/settings.json`, or any other Claude
configuration.

The generated hook command uses the absolute current AgentPulse standalone
binary. When invoked through `node packages/cli/dist/index.js`, it instead uses
the absolute Node executable followed by the absolute CLI entry path. This
avoids depending on Claude Code's working directory or `PATH`.

To intentionally use PATH mode:

```bash
agentpulse setup claude-code --print --binary agentpulse
```

An absolute standalone path can be selected with `--binary <absolute-path>`.
Relative paths are rejected.

On Windows, `~/.claude/settings.json` resolves to
`%USERPROFILE%\.claude\settings.json`. On macOS and Linux it resolves below the
current user's home directory.

## Merge it manually

Copy the printed `hooks` entries into the appropriate existing Claude settings
file. Treat the output as a fragment, not a complete replacement file:

- preserve unrelated settings;
- preserve existing handlers under the same hook event;
- append the AgentPulse command to existing `hooks` arrays;
- validate the final JSON before restarting Claude Code.

If the file already contains a `hooks` object, merge event keys into that
object. If an event such as `Stop` already exists, append the AgentPulse matcher
group to its array. Do not create a second `hooks` key and do not replace
unrelated handlers.

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

## Optional prompt-preview task titles

Task titles derived from prompts are disabled by default. To opt in for the
local browser dashboard, start the daemon with:

```bash
agentpulse daemon --dashboard --dashboard-task-titles prompt-preview
```

On `UserPromptSubmit`, the updated ingest command reads the documented `prompt`
field in memory, collapses whitespace, and emits only a preview of at most 60
Unicode code points as `taskTitle`. It does not emit, store, log, forward, or
return the complete prompt. Other hook events do not inspect the prompt.

The existing hook snippet does not need regeneration when it already invokes
the updated AgentPulse binary or CLI. Ingest discovers the opt-in mode from the
same daemon host and port used for event delivery and silently treats lookup
failure or a 200ms timeout as disabled.

## Verify

First build/link AgentPulse and run the read-only diagnostics:

```bash
agentpulse doctor
```

An unreachable-daemon error is expected until the daemon starts. Start it in a
separate terminal with visible console output:

```bash
agentpulse daemon --notifier console
```

### Synthetic ingest check

This checks the AgentPulse ingest path without launching Claude Code:

```bash
echo '{"session_id":"claude-demo","cwd":"/tmp/demo","hook_event_name":"Stop","last_assistant_message":"Done"}' \
  | agentpulse ingest claude-code

agentpulse status --json
```

The resulting session should have source `claude-code` and status `completed`.

### Real Claude Code hook check

1. Open Claude Code from a directory covered by the settings file you edited.
2. Run `/hooks` and confirm the AgentPulse command appears under the configured
   events.
3. Ask Claude to answer a small prompt. A normal response should trigger
   `UserPromptSubmit` and `Stop`; a tool request can additionally exercise
   `PreToolUse` and `PostToolUse`.
4. Confirm the daemon terminal prints the terminal event and run
   `agentpulse status --json`.

Successful hook ingest is intentionally quiet in the Claude terminal. If the
daemon is unavailable, the hook prints a warning but returns zero so it does not
interrupt Claude Code.

To test OS notifications, restart the daemon with:

```bash
agentpulse daemon --notifier os
```

Trigger a `Stop` event. If the environment cannot deliver desktop
notifications, confirm the daemon remains available with `agentpulse doctor`
and fall back to:

```bash
agentpulse daemon --notifier console
```

See [troubleshooting](troubleshooting.md#claude-code-hook-not-firing) when the
hook does not appear or fire.

For the upstream event definitions, see the
[Claude Code hooks reference](https://code.claude.com/docs/en/hooks).
