# Browser Dashboard

The dashboard is an optional, local, read-only view of the current daemon
process. The v0.3 design is a status-first daily-use surface rather than a
setup-first diagnostic page.

## Start

```bash
agentpulse daemon --dashboard
```

The command prints the dashboard URL but does not open a browser automatically.
The default is:

```text
http://127.0.0.1:3768/dashboard
```

IPv6 loopback is also accepted:

```bash
agentpulse daemon --dashboard --host ::1
```

When `--dashboard` is enabled, AgentPulse rejects every host except
`127.0.0.1` and `::1`. The dashboard cannot be combined with `0.0.0.0`, a LAN
address, or another non-loopback binding. This also applies when the unsafe
value comes from `AGENTPULSE_HOST`; with no host override the dashboard always
binds to `127.0.0.1`.

## Displayed Information

### Overview Mode

The default `/dashboard` page shows:

- daemon health, start time, and process uptime;
- selected notifier mode;
- an **Action needed** section for actionable and error sessions;
- status cards for all normalized sessions held in memory;
- mergeable Claude Code, Codex notify, and Codex hooks setup snippets;
- basic read-only doctor checks.

Action-needed cards place waiting input or permission states before failures and
rate limits, then order each group by the newest event. The complete status
overview retains the daemon's most-recent-first ordering.

Setup snippets and doctor checks remain available below the primary status
view.

### Focus Mode

Select one current session with:

```text
http://127.0.0.1:3768/dashboard?focus=<sessionKey>
```

Focus Mode shows one expanded card and a link back to the overview. A key that
is not present in the current API response produces a focused-session-not-found
state. There is no historical lookup or stale-session recovery.

The browser requests `/dashboard/api` every two seconds and also provides a
manual refresh button. This is ordinary HTTP polling. AgentPulse does not use
SSE or WebSocket.

## Dashboard API

Each dashboard session retains its normalized allowlisted fields and adds
presentation-only derived fields:

- `displayName`;
- `displayWorkspace`;
- `durationMs`;
- `attention`, one of `passive`, `done`, `action`, or `error`;
- optional `actionKind`, either `input` or `permission`.

The attention mapping and future Compact/Floating Mode direction are documented
in [Desktop Presence Product Design](product/desktop-presence.md).

## Security and Data Boundaries

- Dashboard routes exist only when the daemon starts with `--dashboard`.
- Dashboard responses set `Cache-Control: no-store`.
- The page uses a restrictive Content Security Policy and no external scripts,
  styles, frameworks, or CDNs.
- Session, setup, and doctor values are rendered with DOM `textContent`; they
  are never inserted as dynamic HTML.
- API sessions are explicitly serialized from normalized AgentPulse fields.
- Complete platform payloads, prompts, transcripts, raw events, and tool
  input/output are not included.
- There is no login because the dashboard is forcibly restricted to loopback.

AgentPulse still accepts local event submissions through the daemon API. Do not
forward or proxy the unauthenticated daemon outside the trusted machine.

## Lifecycle

The dashboard reflects only the currently running daemon:

- no persistence;
- no historical database;
- no restart recovery;
- no session garbage collection;
- no background browser or desktop service.

Closing the daemon removes all in-memory sessions and makes the dashboard
unavailable.

Desktop/tray integration remains deferred to a later experimental PR.
