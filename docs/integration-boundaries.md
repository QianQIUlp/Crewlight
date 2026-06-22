# Integration Boundaries

AgentPulse reports only activity exposed by documented platform interfaces or
clearly labeled best-effort observation points.

## Precise integration: Claude Code

The Claude Code adapter consumes documented command-hook JSON from stdin. It
maps supported lifecycle events without returning permission decisions or
modifying Claude behavior.

Supported events include session and prompt starts, tool start/completion,
permission requests, actionable notifications, turn completion, and API
failure. Unsupported events are ignored.

`SessionEnd` is intentionally ignored in v0.2 because mapping it to `idle`
could overwrite a terminal session state. The setup snippet does not register
that hook.

When the daemon explicitly enables `--dashboard-task-titles prompt-preview`,
Claude Code
[`UserPromptSubmit.prompt`](https://docs.anthropic.com/en/docs/claude-code/hooks)
may be read in hook-process memory to produce a whitespace-normalized,
60-code-point `taskTitle`. The complete prompt is never emitted or retained.
Default behavior does not inspect prompt content.

## Precise integration: Codex hooks

The Codex hooks adapter consumes documented lifecycle JSON from stdin and maps
session, prompt, tool, permission-request, and stop events. It is
observation-only: every ingest path exits zero with empty stdout and stderr,
while recognized events are delivered to the daemon when available. It does
not return hook response fields, warnings, debug text, prompts, tool
input/output, transcripts, complete payloads, or other data that could change
Codex behavior.

The setup command prints a mergeable fragment only. Users must review and trust
the exact command through Codex `/hooks`; AgentPulse does not bypass that trust
mechanism.

By default the adapter does not read prompts, transcript files or paths, tool
input, tool response/output, assistant messages, or complete payloads. With
explicit prompt-preview opt-in, only `UserPromptSubmit.prompt` is read in
memory, and only the bounded derived `taskTitle` leaves the hook process. The
event and field are documented in the official
[Codex hooks reference](https://developers.openai.com/codex/hooks).

## Narrow official integration: Codex notify

The Codex adapter consumes the documented external `notify` JSON argument.
Codex currently documents only `agent-turn-complete` for this interface, so
v0.2 maps only that event to `completed`.

The notify interface by itself does not claim Codex `running`, `waiting_input`,
or `waiting_permission`. Built-in TUI notifications and the app-server protocol
are separate interfaces and are not used by this adapter.

The adapter never copies complete `input-messages`; it uses a bounded
`last-assistant-message` when available.

Codex notify is never a prompt-preview title source.

## OpenCode plugin MVP

The OpenCode adapter consumes documented plugin events and maps only session,
permission, tool lifecycle, and message activity states. The generated plugin
uses an argv-array child process call and sends only event type, session ID,
status type, cwd, and timestamp.

Prompts, message content, tool arguments, tool output, file contents,
environment data, and raw events are not sent to AgentPulse. The implementation
is pending real local verification and is not yet labeled `supported`.

## Cursor manual / experimental bridge

The Cursor integration accepts explicit local bridge events through
`agentpulse ingest cursor`. Users can provide a small JSON object on stdin or
use command flags from Cursor's integrated terminal or user-defined tasks.

The bridge maps only the caller-supplied event name, session ID, workspace,
project path, task title, short message, timestamp, and one of the allowed
`ide-extension`, `desktop`, or `manual` surfaces. Unknown payload fields are
discarded. Prompts, transcripts, tool input/output, file contents, Cursor
databases, extension storage, private logs, and complete payloads are never
emitted.

AgentPulse does not claim that Cursor exposes a stable public lifecycle hook.
This bridge is manual and experimental: it reports only the state the user or a
user-defined task explicitly submits. Setup prints commands but does not read
or modify Cursor settings.

## Experimental and research-only surfaces

Codex Desktop reuses the Codex hooks adapter with `surface=desktop`. It remains
experimental until a real Desktop test confirms hook loading and payload
behavior.

The Antigravity probe emits only caller-observed, sanitized metadata with
`status=unknown`. It is research scaffolding, not a formal adapter. AgentPulse
does not claim a verified Antigravity hook configuration or payload contract.

## Best-effort integration

The generic CLI wrapper reports only the process it starts:

- successful spawn: `running`;
- exit code zero: `completed`;
- non-zero exit code, signal, or spawn error: `failed`.

It cannot inspect internal tools, permission prompts, or model state.

## Manual integration

`agentpulse emit` accepts explicit caller-provided events. AgentPulse validates
and aggregates the event but cannot verify the caller's platform
interpretation.

## Adapter contract

Adapters may inspect a raw source payload while translating it, but must emit a
whitelisted `AgentEventInput`. They must not:

- persist or forward the complete raw payload;
- update the session store directly;
- send notifications directly;
- influence platform permission decisions;
- claim lifecycle states the source interface does not expose.

Prompt-preview capability discovery uses the same configured daemon endpoint as
event delivery. It has a 200ms timeout and resolves to disabled on timeout,
connection failure, invalid JSON, unexpected response shape, or non-success
status so host workflows remain non-blocking.

Claude Code hook and Codex notify ingest commands warn and return zero for
invalid input, unsupported event types, or daemon delivery failure. Codex hook,
OpenCode plugin, and Antigravity probe ingest instead return no stdout or stderr
output and exit zero so platform lifecycle execution continues without
hook-failure noise. Generated Codex hook commands pass the lifecycle event in
`--hook`; stdin is optional payload and is not the sole event source.

## Prohibited foundations

Core functionality must not depend on private API reverse engineering, binary
patching, process injection, OCR, screen scraping, window watching, simulated
input, or undocumented desktop internals.
