# OpenCode Plugin MVP

AgentPulse includes an OpenCode plugin MVP. It is implemented but pending real
local verification before receiving a `supported` label.

## Print the plugin

```bash
agentpulse setup opencode --print
```

The command prints one JavaScript plugin file. It does not inspect or modify
OpenCode configuration. Save the output to either:

- `.opencode/plugins/agentpulse.js` for one project;
- `~/.config/opencode/plugins/agentpulse.js` for global use.

OpenCode automatically loads local plugin files from these locations at
startup. Preserve other plugins already present.

By default the generated plugin embeds the current standalone executable path,
or the absolute Node executable and CLI entry path in source mode. Use
`--binary agentpulse` only when OpenCode can reliably resolve AgentPulse from
`PATH`.

## Run and verify

Start AgentPulse:

```bash
agentpulse daemon --dashboard --notifier console
```

Restart OpenCode after placing the plugin, start a minimal session, exercise a
tool and permission prompt if practical, and then inspect the dashboard. The
expected result is an OpenCode session moving through conservative states such
as `running`, `using_tool`, `waiting_permission`, `completed`, or `failed`.

The MVP maps:

| OpenCode event        | AgentPulse status    |
| --------------------- | -------------------- |
| `session.created`     | `running`            |
| `session.updated`     | `running`            |
| `session.status`      | best effort          |
| `session.idle`        | `completed`          |
| `session.error`       | `failed`             |
| `permission.asked`    | `waiting_permission` |
| `permission.replied`  | `running`            |
| `tool.execute.before` | `using_tool`         |
| `tool.execute.after`  | `running`            |
| `message.updated`     | `running`            |

Unknown events are ignored.

## Safety and failure behavior

The generated plugin uses `Bun.spawn` with an argv array, not a shell command
string. It checks that `Bun.spawn` exists, discards child stdout and stderr,
guards optional `unref()`, catches all errors, and does not wait for AgentPulse.

Only event type, session identity, status type, project directory, and a local
timestamp are sent. Prompts, message content, tool arguments, tool results,
file contents, raw events, and environment data are not forwarded.

`agentpulse ingest opencode-plugin` always exits zero and writes nothing to
stdout or stderr, including for invalid input, unsupported events, stdin
failures, and daemon connection failures.

## Windows and Desktop boundary

[OpenCode recommends WSL](https://opencode.ai/docs/windows-wsl/) for the best
Windows experience, although native installs exist. Native Windows and WSL
must be verified separately.

OpenCode Desktop runs an OpenCode sidecar and may load the same plugin
configuration, but AgentPulse has not verified that behavior. OpenCode Desktop
support is `experimental`.
