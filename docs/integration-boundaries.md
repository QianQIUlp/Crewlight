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

## Narrow official integration: Codex CLI

The Codex adapter consumes the documented external `notify` JSON argument.
Codex currently documents only `agent-turn-complete` for this interface, so
v0.2 maps only that event to `completed`.

AgentPulse does not claim Codex `running`, `waiting_input`, or
`waiting_permission` support. Built-in TUI notifications and the app-server
protocol are separate interfaces and are not used by this adapter.

The adapter never copies complete `input-messages`; it uses a bounded
`last-assistant-message` when available.

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

Ingest commands warn and return zero for invalid input, unsupported event
types, or daemon delivery failure so platform lifecycle execution continues.

## Prohibited foundations

Core functionality must not depend on private API reverse engineering, binary
patching, process injection, OCR, screen scraping, window watching, simulated
input, or undocumented desktop internals.
