# Set up Codex Hooks

Codex lifecycle hooks invoke AgentPulse with the event name in
`--hook <EventName>` and may send one JSON payload on stdin. AgentPulse follows
this hook best practice so event identity does not depend on stdin parsing. The
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

On Windows, `commandWindows` is the field Codex uses to execute the hook.
Codex CLI 0.141.0 has a compatibility issue when that command begins with a
quoted executable path. AgentPulse therefore emits an unquoted
`commandWindows` only when every resolved executable path token is a simple
path containing letters, numbers, `:`, `\`, `/`, `.`, `_`, or `-`.

Install the standalone executable in a simple no-space path such as:

```text
C:\Users\<you>\Tools\AgentPulse\agentpulse.exe
```

The generated command is:

```text
C:\Users\<you>\Tools\AgentPulse\agentpulse.exe ingest codex-hook --hook Stop --surface cli
```

If the path contains whitespace or command-sensitive characters, setup fails
closed with a diagnostic instead of printing a known-broken hooks fragment. It
does not copy the executable or modify Codex configuration.

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

Each generated hook command passes its event name explicitly, for example
`--hook Stop`, and setup also passes `--surface cli`. The event argv value takes
precedence over `hook_event_name` in stdin.
When `--hook` is absent for backward compatibility, AgentPulse falls back to the
stdin event name and uses `surface=unknown`. Missing, malformed, or changed
stdin does not block a valid explicit hook event.

By default, the stdin payload is used only for the session ID, working
directory, and a bounded tool name where useful. AgentPulse does not read or
retain prompts, `transcript_path`, tool input, tool response/output, assistant
messages, or the complete payload.

### Optional prompt-preview task titles

Prompt-derived titles remain disabled unless the local daemon starts with:

```bash
agentpulse daemon --dashboard --dashboard-task-titles prompt-preview
```

When enabled, only the documented `UserPromptSubmit.prompt` string is read in
memory. AgentPulse collapses whitespace and sends only a preview of at most 60
Unicode code points as `taskTitle`; the complete prompt is never serialized
into an AgentPulse event, stored, logged, forwarded, or included in dashboard
responses. Tool events, Stop, transcripts, tool input/output, assistant output,
and Codex notify `input-messages` are not title sources.

Existing hooks do not need regeneration when their command invokes the updated
AgentPulse binary or CLI. Capability lookup reuses the same daemon address as
event delivery, waits no more than 200ms, and silently defaults to disabled on
any failure.

AgentPulse treats Codex hooks as fire-and-forget observations. Every path exits
zero and writes nothing to stdout or stderr by default, including successful
events, invalid JSON, unsupported events, stdin failures, and daemon delivery
failures. Recognized events are still delivered to the daemon when it is
available.

AgentPulse does not return hook response fields, warnings, debug text, prompts,
tool input/output, transcripts, or complete payloads. This keeps the integration
observation-only and prevents AgentPulse from blocking or modifying Codex
behavior.

## Verify

Start the daemon:

```bash
agentpulse daemon --notifier console
```

Synthetic check:

```bash
printf '%s' '{"session_id":"codex-hook-demo","cwd":"/tmp/demo"}' \
  | agentpulse ingest codex-hook --hook PermissionRequest --surface cli
agentpulse status --json
```

Then use `/hooks` to review the real handlers and run a Codex turn that invokes
a tool. On Windows, confirm that the displayed `commandWindows` does not begin
with a quote. See the official
[Codex hooks reference](https://developers.openai.com/codex/hooks).

Codex Desktop remains experimental. For a controlled Desktop test, use
`agentpulse setup codex-hooks --print --surface desktop` and follow the
[manual verification checklist](codex-desktop.md). The documented Codex notify
integration is a stable fallback when completed-only notifications are
sufficient.
