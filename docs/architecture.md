# AgentPulse Architecture

AgentPulse is a local event normalization and session aggregation service.
Platform integrations observe documented or explicitly bounded activity,
translate it to `AgentEventInput`, and submit it to the daemon.

## Data flow

```text
Claude hook / Codex notify / Cursor bridge / wrapper / manual emit
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
              GET /dashboard      (only with --dashboard)
              GET /dashboard/api  (only with --dashboard)
```

Adapters translate source payloads only. They do not own session state,
notification policy, UI, or platform permission decisions.

## Package responsibilities

- `@agentpulse/core`: schemas, normalized types, session key derivation, and
  in-memory session aggregation.
- `@agentpulse/daemon`: local HTTP receiver, process-lifetime state, optional
  browser dashboard, and daemon configuration.
- `@agentpulse/notifier`: notification policy plus console, OS, and no-op
  outputs.
- `@agentpulse/adapter-claude-code`: documented Claude Code hook translation.
- `@agentpulse/adapter-codex`: documented Codex external notify translation.
- `@agentpulse/adapter-cursor`: manual, experimental Cursor bridge
  translation.
- `@agentpulse/adapter-generic-cli`: best-effort command lifecycle observation.
- `@agentpulse/cli`: daemon/dashboard startup, diagnostics, emit, ingest, setup,
  status, and run commands.
- `@agentpulse/shared`: runtime configuration defaults.

Dependencies flow toward `core`; adapters never depend on notifier outputs.

## Event boundary

`AgentEventInput` is the untrusted daemon ingestion shape. Normalization
validates it, supplies defaults, derives `sessionKey`, and produces a safe
`AgentEvent`.

Platform adapters use passthrough input schemas because upstream platforms may
add fields. Their outputs are explicit allowlists containing only normalized
identity, status, explicit task title, event title, and message fields. They do
not attach complete payloads as `rawEvent`.

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
- `GET /dashboard` and its static assets provide the optional local browser
  page.
- `GET /dashboard/api` returns health, notifier mode, whitelisted sessions,
  setup snippets, and basic doctor output with `Cache-Control: no-store`.

`AGENTPULSE_HOST` and `AGENTPULSE_PORT` configure both daemon and clients.
`AGENTPULSE_NOTIFIER` selects `console`, `os`, or `none`; the daemon
`--notifier` flag takes precedence.

Dashboard routes are registered only for `agentpulse daemon --dashboard`.
Dashboard startup defaults to `127.0.0.1` and rejects every non-loopback host
before opening a listener, including unsafe values inherited from
`AGENTPULSE_HOST`.
Dashboard mode requires `127.0.0.1` or `::1` even if a trusted developer would
otherwise choose a broader daemon bind address.

OS notification runtime code is loaded lazily only when an actionable event
needs notification. Import failures, unsupported module shapes, runtime
exceptions, callback errors, and timeouts are contained inside `OsNotifier`.
They produce safe warnings and cannot fail daemon startup or event ingestion.

## Deferred architecture

Persistence, SSE/WebSocket broadcasting, session cleanup, IDE extensions,
automatic Cursor lifecycle observation, and broader Codex lifecycle
observation remain deferred.
