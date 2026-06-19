# Browser Dashboard

The v0.2.2 dashboard is an optional, local, read-only view of the current daemon
process.

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
address, or another non-loopback binding.

## Displayed Information

The page shows:

- daemon health, start time, and process uptime;
- selected notifier mode;
- current normalized sessions held in memory;
- mergeable Claude Code and Codex setup snippets;
- basic read-only doctor checks.

The browser requests `/dashboard/api` every two seconds and also provides a
manual refresh button. This is ordinary HTTP polling. AgentPulse does not use
SSE or WebSocket.

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
