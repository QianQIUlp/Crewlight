# Set up Codex CLI

Codex can invoke one external notification program with a JSON payload supplied
as a single argument.

## Print the snippet

```bash
agentpulse setup codex --print
```

Output:

```toml
notify = ["agentpulse", "ingest", "codex"]
```

This is a snippet for the user-level `~/.codex/config.toml`. Codex does not
honor `notify` from project-local configuration. AgentPulse never reads or
modifies the config file.

## Merge it manually

Do not overwrite an existing `notify` value without reviewing it. The array is
the executable plus arguments for one external program; it is not a list of
independent notifier commands.

If `notify` already exists:

1. keep the existing command when it is still required;
2. create or update a wrapper/dispatcher that invokes both the existing
   notifier and `agentpulse ingest codex`;
3. point the single Codex `notify` array at that wrapper.

Only extend an existing argv array directly when that command is already a
dispatcher designed to accept and invoke additional notifier targets.

## Supported event

AgentPulse v0.2 supports only the officially documented
`agent-turn-complete -> completed` event. It does not claim Codex running,
input-waiting, or permission-waiting states.

## Verify

With the AgentPulse daemon running:

```bash
agentpulse ingest codex \
  '{"type":"agent-turn-complete","thread-id":"codex-demo","turn-id":"turn-1","cwd":"/tmp/demo","last-assistant-message":"Done"}'

agentpulse status --json
```

The resulting session should have source `codex` and status `completed`.

For the upstream configuration contract, see
[Codex advanced configuration](https://developers.openai.com/codex/config-advanced#notifications).
