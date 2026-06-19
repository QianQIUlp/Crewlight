# AgentPulse Architecture

AgentPulse is a local event normalization and session aggregation service.
Platform integrations observe documented or explicitly bounded activity,
translate it to `AgentEventInput`, and submit it to the daemon.

## Data flow

```text
Claude hook / Codex notify / wrapper / manual emit
                        |
                        v
               platform adapter
                        |
                        v
                AgentEventInput
                        |
                        v
              normalizeAgentEvent
                        |
                        v
                  AgentEvent
                        |
             +----------+----------+
             |                     |
             v                     v
       SessionStore        selected Notifier
             |             /      |       \
             v        console     OS      none
       GET /sessions
```

Adapters translate source payloads only. They do not own session state,
notification policy, UI, or platform permission decisions.

## Package responsibilities

- `@agentpulse/core`: schemas, normalized types, session key derivation, and
  in-memory session aggregation.
- `@agentpulse/daemon`: local HTTP receiver, process-lifetime state, and daemon
  configuration.
- `@agentpulse/notifier`: notification policy plus console, OS, and no-op
  outputs.
- `@agentpulse/adapter-claude-code`: documented Claude Code hook translation.
- `@agentpulse/adapter-codex`: documented Codex external notify translation.
- `@agentpulse/adapter-generic-cli`: best-effort command lifecycle observation.
- `@agentpulse/cli`: daemon, emit, ingest, setup, status, and run commands.
- `@agentpulse/shared`: runtime configuration defaults.

Dependencies flow toward `core`; adapters never depend on notifier outputs.

## Event boundary

`AgentEventInput` is the untrusted daemon ingestion shape. Normalization
validates it, supplies defaults, derives `sessionKey`, and produces a safe
`AgentEvent`.

Platform adapters use passthrough input schemas because upstream platforms may
add fields. Their outputs are explicit allowlists containing only normalized
identity, status, title, and message fields. They do not attach complete
payloads as `rawEvent`.

`AgentEvent` and `AgentSession` never contain `rawEvent`. No platform prompt,
transcript, tool input/output, or complete Codex `input-messages` collection is
stored or printed.

## Session identity and lifecycle

`sessionId` is supplied by a platform; `sessionKey` is AgentPulse-owned and
namespaced by source and surface. Without a session ID, normalized project path
is used as a stable fallback.

Active states are `running`, `using_tool`, `waiting_input`, and
`waiting_permission`. Terminal states are `completed` and `failed`.
`rate_limited` is retained as reported state but is not used as a generic
terminal transition by the store.

Claude Code `SessionEnd` is ignored in v0.2. A stateless adapter cannot know
whether sending `idle` would overwrite a more useful `completed`, `failed`, or
`rate_limited` state already held by the daemon.

The daemon retains sessions in memory for its process lifetime. There is no
persistence, retention limit, or garbage collection.

## Runtime interfaces

The daemon listens on `127.0.0.1:3768` by default:

- `POST /events` accepts `AgentEventInput` and returns `{ event, session }`.
- `GET /sessions` returns sessions ordered by most recent event.

`AGENTPULSE_HOST` and `AGENTPULSE_PORT` configure both daemon and clients.
`AGENTPULSE_NOTIFIER` selects `console`, `os`, or `none`; the daemon
`--notifier` flag takes precedence.

OS notification runtime code is loaded lazily only when an actionable event
needs notification. Import failures, unsupported module shapes, runtime
exceptions, callback errors, and timeouts are contained inside `OsNotifier`.
They produce safe warnings and cannot fail daemon startup or event ingestion.

## Deferred architecture

Persistence, SSE/WebSocket broadcasting, session cleanup, desktop and IDE
surfaces, OpenCode and Cursor adapters, and broader Codex lifecycle observation
remain deferred.
