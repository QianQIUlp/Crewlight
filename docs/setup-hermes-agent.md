# Hermes Agent integration (experimental)

Crewlight observes an allowlisted subset of Hermes Agent shell-hook fields. It does not retain prompts, transcripts, tool input, tool output, or complete hook payloads.

## Configure

Print a mergeable YAML hooks block:

```bash
crewlight setup hermes-agent --print
```

Crewlight only prints the YAML. It does not read or modify Hermes configuration. Merge the generated event entries into the existing `hooks` block in `~/.hermes/config.yaml`, preserving other settings and hooks. The shape is:

```yaml
hooks:
  on_session_start:
    - command: "<generated Crewlight ingest command>"
      timeout: 5
  pre_tool_call:
    - command: "<generated Crewlight ingest command>"
      timeout: 5
```

The complete generated block covers `on_session_start`, `pre_llm_call`, `pre_tool_call`, `post_tool_call`, `post_llm_call`, `pre_approval_request`, `post_approval_response`, `subagent_start`, `subagent_stop`, and `on_session_end`.

Hermes asks for consent the first time it sees each exact `(event, command)` pair. Review and approve the generated commands interactively. Use `hermes hooks list` and `hermes hooks doctor` to inspect registration and consent status; do not enable blanket auto-accept merely to bypass review.

The default output embeds the current Crewlight executable path. Use `--binary crewlight` only when Hermes can reliably resolve `crewlight` from `PATH`.

## Verify

Start the daemon, inspect the hooks, and complete a real Hermes turn:

```bash
crewlight daemon --notifier console
hermes hooks list
hermes hooks doctor
```

The adapter smoke test printed by `crewlight setup` checks only Crewlight's parser and daemon ingest path. It does not prove that Hermes loaded, approved, or executed the hook configuration.
