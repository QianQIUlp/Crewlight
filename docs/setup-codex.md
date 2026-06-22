# Set up Codex CLI

Codex can invoke one external notification program with a JSON payload supplied
as a single argument.

## Print the snippet

```bash
crewlight setup codex --print
```

Output:

```toml
notify = ["/absolute/path/to/crewlight", "ingest", "codex"]
```

This is a snippet for the user-level `~/.codex/config.toml`. Codex does not
honor `notify` from project-local configuration. Crewlight never reads or
modifies the config file.

Codex stores configuration under `CODEX_HOME`, which defaults to `~/.codex`.
On native Windows the default is `%USERPROFILE%\.codex`; a Codex CLI running
inside WSL uses the Linux home unless `CODEX_HOME` is explicitly shared.

The default command uses the current standalone executable's absolute path. In
source mode it uses the absolute Node executable and absolute CLI entry path.
Use `--binary crewlight` only when Codex can reliably resolve Crewlight from
`PATH`; use another `--binary` value only for an absolute executable path.

## Merge it manually

Do not overwrite an existing `notify` value without reviewing it. The array is
the executable plus arguments for one external program; it is not a list of
independent notifier commands.

If `notify` already exists:

1. keep the existing command when it is still required;
2. create or update a wrapper/dispatcher that invokes both the existing
   notifier and the generated Crewlight command;
3. point the single Codex `notify` array at that wrapper.

Only extend an existing argv array directly when that command is already a
dispatcher designed to accept and invoke additional notifier targets.

## Supported event

Crewlight v0.2 supports only the officially documented
`agent-turn-complete -> completed` event. It does not claim Codex running,
input-waiting, or permission-waiting states.

## Verify

First run the read-only diagnostics. An unreachable-daemon error is expected
until the daemon starts:

```bash
crewlight doctor
```

Start the daemon in a separate terminal with visible console output:

```bash
crewlight daemon --notifier console
```

### Synthetic ingest check

This checks the Crewlight ingest path without launching Codex:

```bash
crewlight ingest codex \
  '{"type":"agent-turn-complete","thread-id":"codex-demo","turn-id":"turn-1","cwd":"/tmp/demo","last-assistant-message":"Done"}'

crewlight status --json
```

The resulting session should have source `codex` and status `completed`.

### Real Codex notify check

1. Confirm `notify` is in the user-level `config.toml`, not a project
   `.codex/config.toml`.
2. Start a new Codex CLI turn and let it complete.
3. Confirm the daemon terminal prints a `codex completed` event.
4. Run `crewlight status --json` and confirm the session source is `codex`.

Codex passes one JSON argument to the external command. Crewlight currently
maps only the documented `agent-turn-complete` notification. Successful notify
ingest is intentionally quiet in the Codex terminal.

To test OS notifications, restart the daemon with
`crewlight daemon --notifier os` and complete another turn. If desktop
delivery is unavailable, confirm `crewlight doctor --notifier os` reports only
a warning and use `crewlight daemon --notifier console`.

See [troubleshooting](troubleshooting.md#codex-notify-not-firing) when no event
arrives.

For lifecycle states before turn completion, separately configure the
observation-only [Codex hooks integration](setup-codex-hooks.md).

For the upstream configuration contract, see
[Codex advanced configuration](https://developers.openai.com/codex/config-advanced#notifications).
