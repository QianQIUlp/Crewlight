# Set up Codex Hooks

Codex lifecycle hooks send one JSON object to AgentPulse on stdin. This
integration observes documented lifecycle events without changing Codex
permission or turn behavior.

## Print the snippet

```bash
agentpulse setup codex-hooks --print
```

The command prints a mergeable `hooks.json` fragment. It does not inspect or
modify `~/.codex/hooks.json`, project `.codex/hooks.json`, `config.toml`, or any
other Codex configuration.

By default the generated commands use the current standalone executable's
absolute path. Source mode uses the absolute Node executable followed by the
absolute CLI entry path. Use `--binary agentpulse` only when the Codex hook
environment has a reliable `PATH`; other `--binary` values must be absolute.
Windows output uses quoted Windows command lines and includes `commandWindows`.

## Merge and trust manually

Merge the printed event groups into one active `hooks` object while preserving
existing handlers. Suitable locations include user-level
`~/.codex/hooks.json` and project `.codex/hooks.json`.

Project hooks load only for trusted projects. Every non-managed command hook
must also be reviewed and trusted against its exact definition:

1. start Codex after merging the fragment;
2. open `/hooks`;
3. inspect the source and complete AgentPulse command;
4. trust it only when the executable path and arguments match your installation.

AgentPulse does not bypass or weaken this review flow.

## Observed events

| Codex hook          | AgentPulse status    |
| ------------------- | -------------------- |
| `SessionStart`      | `running`            |
| `UserPromptSubmit`  | `running`            |
| `PreToolUse`        | `using_tool`         |
| `PermissionRequest` | `waiting_permission` |
| `PostToolUse`       | `running`            |
| `Stop`              | `completed`          |

The command reads only the session ID, working directory, event name, and a
bounded tool name where useful. It does not read or retain prompts,
`transcript_path`, tool input, tool response/output, assistant messages, or the
complete payload.

Every invocation writes the no-op JSON `{"continue":true}` to stdout and exits
zero, including invalid JSON, unsupported events, and daemon delivery failures.
Codex hook ingest writes nothing to stderr by default. The response contains no
additional context, system message, permission decision, updated input,
suppression, blocking, or other behavior-changing fields, so AgentPulse remains
observation-only.

## Verify

Start the daemon:

```bash
agentpulse daemon --notifier console
```

Synthetic check:

```bash
printf '%s' '{"session_id":"codex-hook-demo","cwd":"/tmp/demo","hook_event_name":"PermissionRequest"}' \
  | agentpulse ingest codex-hook
agentpulse status --json
```

Then use `/hooks` to review the real handlers and run a Codex turn that invokes
a tool. See the official [Codex hooks reference](https://developers.openai.com/codex/hooks).
