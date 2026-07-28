# CodeWhale integration

Crewlight can observe CodeWhale's structured hook events without retaining prompts, tool arguments, or result previews.

## Configure

Print mergeable TOML entries:

```bash
crewlight setup codewhale --print
```

Crewlight only prints the TOML. It does not read or modify CodeWhale configuration. Append the output to `~/.codewhale/config.toml`, preserving existing settings and hook entries. The generated entries use CodeWhale's `[[hooks.hooks]]` format, set `continue_on_error = true`, and register only these events:

- `message_submit`
- `turn_end`
- `subagent_spawn`
- `subagent_complete`

These are the events that supply structured JSON on standard input. CodeWhale's `session_start`, `session_end`, `tool_call_before`, `tool_call_after`, `mode_change`, and `on_error` hooks expose their context through environment variables instead, so the direct Crewlight ingest command deliberately does not register them.

CodeWhale hooks run only in the interactive TUI. They do not run for `codewhale exec`, app-server, or ACP sessions.

The default output embeds the current Crewlight executable path. Use `--binary crewlight` only when CodeWhale can reliably resolve `crewlight` from `PATH`.

## Verify

Start the daemon, inspect the loaded hooks in CodeWhale, and complete a real turn:

```bash
crewlight daemon --notifier console
```

In the CodeWhale TUI, run `/hooks`. The adapter smoke test printed by `crewlight setup` only checks Crewlight's parser and daemon path; it does not prove that CodeWhale loaded the hook configuration.
