# Troubleshooting

Crewlight defaults to `127.0.0.1:3768`. Commands below assume that endpoint
unless `CREWLIGHT_HOST` or `CREWLIGHT_PORT` is set.

## `crewlight` command not found

**Symptom:** The shell reports `crewlight: command not found`, “not recognized
as the name of a cmdlet,” or an equivalent error.

**Likely cause:** The CLI has not been built and linked, or the npm global bin
directory is not on `PATH`.

**Diagnostic command:**

```bash
command -v crewlight
node packages/cli/dist/index.js --help
```

In PowerShell use `Get-Command crewlight`. Run `npm prefix -g` to inspect the
global npm prefix.

**Fix:** From the repository root run `pnpm build`, then `cd packages/cli &&
npm link`. Open a new shell if its `PATH` changed.

**Fallback:** Invoke the built CLI directly:

```bash
node packages/cli/dist/index.js doctor
```

## Daemon not running

**Symptom:** `crewlight doctor`, `status`, or `emit` says the daemon is
unreachable.

**Likely cause:** No daemon process is listening, or the previous process
exited.

**Diagnostic command:**

```bash
crewlight doctor
```

**Fix:** Start the daemon in a dedicated terminal:

```bash
crewlight daemon --notifier console
```

**Fallback:** Platform hook/notify commands return zero and allow Claude/Codex
to continue, but events are not retained until the daemon is available.

## Daemon unreachable

**Symptom:** A daemon appears to be running, but clients cannot connect.

**Likely cause:** Client and daemon use different host/port values, an invalid
remote/container address is configured, or loopback refers to a different
environment.

**Diagnostic command:**

```bash
printf 'HOST=%s PORT=%s\n' "${CREWLIGHT_HOST:-127.0.0.1}" "${CREWLIGHT_PORT:-3768}"
crewlight doctor --json
```

In PowerShell inspect `$env:CREWLIGHT_HOST` and `$env:CREWLIGHT_PORT`.

**Fix:** Start the daemon and clients with matching variables. Prefer
`127.0.0.1` on one machine. In containers, bind intentionally and use the
forwarded/reachable address; do not expose the unauthenticated daemon publicly.

**Fallback:** Return both sides to the default loopback endpoint and run
`crewlight daemon --notifier console`.

## Port conflict

**Symptom:** Daemon startup says the selected address is already in use.

**Likely cause:** Another Crewlight daemon or unrelated process owns port
`3768`.

**Diagnostic command:**

```bash
lsof -nP -iTCP:3768 -sTCP:LISTEN
```

Linux alternatives include `ss -ltnp`; PowerShell can use
`Get-NetTCPConnection -LocalPort 3768`.

**Fix:** Stop the stale process, or choose another port for both daemon and
clients:

```bash
CREWLIGHT_PORT=4768 crewlight daemon --notifier console
CREWLIGHT_PORT=4768 crewlight doctor
```

In PowerShell assign `$env:CREWLIGHT_PORT = "4768"` first.

**Fallback:** Use any free loopback port and keep the same environment variable
in hook/notify process environments.

## OS notification unavailable

**Symptom:** `doctor --notifier os` warns, or daemon output says OS delivery
failed, timed out, or could not load.

**Likely cause:** `node-notifier` is unavailable, the environment has no desktop
session, OS notification services/permissions are disabled, or a container/SSH
session cannot access the host desktop.

**Diagnostic command:**

```bash
crewlight doctor --notifier os
crewlight emit --source custom --surface manual --status completed --message "OS notifier check"
crewlight status --json
```

The doctor probe does not send a notification; the emit command exercises
delivery when an OS-notifier daemon is already running.

**Fix:** Enable OS notifications for the current user/session and run the daemon
on the desktop host. On Linux ensure a supported notification service is
available; macOS and Windows may require notification permissions.

**Fallback:**

```bash
crewlight daemon --notifier console
```

An OS failure must not stop daemon startup or event ingestion.

## Claude Code hook not firing

**Symptom:** Completing a Claude Code turn creates no `claude-code` session.

**Likely cause:** The snippet was merged into the wrong settings scope, the
handler was replaced during a merge, hooks are disabled, the event/matcher does
not apply, or `crewlight` is absent from the hook process `PATH`.

**Diagnostic command:**

```bash
echo '{"session_id":"claude-diagnostic","cwd":"/tmp","hook_event_name":"Stop"}' \
  | crewlight ingest claude-code
crewlight status --json
```

Also run `/hooks` inside Claude Code and inspect the event, source file,
matcher, and full command.

**Fix:** Merge the snippet into `~/.claude/settings.json`,
`.claude/settings.json`, or `.claude/settings.local.json`. On Windows,
`~/.claude` is `%USERPROFILE%\.claude`. Preserve existing event arrays and use
the default generated absolute command if the hook environment has a restricted
`PATH`. Regenerate with `--binary crewlight` only for deliberate PATH mode.

**Fallback:** Use the synthetic ingest command to verify Crewlight separately,
then keep the console notifier visible while correcting the hook.

## Codex notify not firing

**Symptom:** Completing a Codex CLI turn creates no `codex` session.

**Likely cause:** `notify` was placed in project `.codex/config.toml`, an
existing notifier was overwritten or retained instead, the argv array is
invalid, or the command is not on `PATH`.

**Diagnostic command:**

```bash
crewlight ingest codex \
  '{"type":"agent-turn-complete","thread-id":"codex-diagnostic","cwd":"/tmp"}'
crewlight status --json
```

Inspect `${CODEX_HOME:-$HOME/.codex}/config.toml`. On native Windows the default
is `%USERPROFILE%\.codex\config.toml`; WSL normally has a separate Linux
`~/.codex`.

**Fix:** Put the generated `notify` array at the user level. It defaults to an
absolute executable command. Codex supports one external notifier argv array.
If another notifier is needed, point `notify` to a wrapper that dispatches to
both commands.

**Fallback:** Use synthetic ingest to isolate Crewlight, or keep the existing
notifier and call Crewlight from its wrapper.

See the official
[Codex notification configuration](https://developers.openai.com/codex/config-advanced#notifications).

## Codex hook not firing

**Symptom:** Codex lifecycle activity does not create or update a `codex`
session, while notify completion may still work.

**Likely cause:** The hooks fragment was not merged, the project config layer is
untrusted, the exact command is awaiting hook review, hooks are disabled, or
the generated executable path moved. On Windows, Codex CLI 0.141.0 also has a
compatibility issue when the executable in `commandWindows` is wrapped in
leading quotes.

**Diagnostic command:**

```bash
printf '%s' '{"session_id":"codex-hook-diagnostic","cwd":"/tmp"}' \
  | crewlight ingest codex-hook --hook PermissionRequest --surface cli
crewlight status --json
```

**Fix:** Regenerate `crewlight setup codex-hooks --print`, merge it without
replacing existing groups, then use Codex `/hooks` to inspect and trust the exact
command. Do not bypass hook trust. If the binary moved, regenerate the snippet
so its absolute path is current.

For Windows Codex hooks, `commandWindows` is the critical execution field.
Install `crewlight.exe` into a simple no-space path without command-sensitive
characters, for example:

```text
C:\Users\<you>\Tools\Crewlight\crewlight.exe
```

The generated `commandWindows` should resemble:

```text
C:\Users\<you>\Tools\Crewlight\crewlight.exe ingest codex-hook --hook Stop --surface cli
```

It must not begin with a quote. If setup reports that the resolved command is
unavailable, move or reinstall Crewlight at a simple path and regenerate the
fragment. Crewlight does not copy the binary or edit user configuration.

Every generated event command must contain its matching `--hook <EventName>`.
Crewlight treats stdin as optional payload data; the explicit argv event takes
priority over `hook_event_name` in that payload. This allows lifecycle
observation to continue when stdin is missing, malformed, or changes shape.

**Fallback:** Keep the documented Codex notify integration for completion events
while resolving hook setup. Codex notify continues to use a TOML argv array and
is not affected by this Windows hook-runner issue. Codex Desktop remains
unverified.

## Setup snippet merge conflict

**Symptom:** The generated fragment conflicts with existing `hooks` or `notify`
configuration, or replacing the file removes unrelated settings.

**Likely cause:** Setup output is a fragment, not a complete replacement file.
Claude event arrays are mergeable; Codex `notify` is one command argv array.

**Diagnostic command:**

```bash
crewlight setup claude-code --print
crewlight setup codex --print
crewlight setup codex-hooks --print
```

Compare the printed stdout with the existing file. Validate Claude JSON with a
JSON parser and Codex TOML with the Codex CLI before relying on it.

**Fix:** For Claude, preserve the single `hooks` object and append Crewlight
matcher groups to existing event arrays. For Codex, preserve an existing
notifier or replace it only with a deliberate wrapper/dispatcher.

**Fallback:** Do not merge until the conflict is understood. Synthetic ingest
commands can verify Crewlight without changing platform configuration.

## Platform notes

- **macOS:** User files are below the normal home directory. OS notifications
  may require permission for the terminal/runtime launching Crewlight.
- **Linux:** Desktop notifications require a graphical session and notification
  service. SSH, containers, and headless hosts commonly require console
  fallback.
- **Windows:** `~/.claude` and `~/.codex` resolve below `%USERPROFILE%` for
  native tools. PowerShell environment syntax differs from POSIX shells.
- **WSL:** Native Windows and WSL have separate home directories and desktop
  access by default. Ensure the platform CLI, Crewlight daemon, and config file
  use the same environment or explicitly bridge them.
