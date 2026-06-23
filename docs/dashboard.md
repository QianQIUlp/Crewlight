# Browser Dashboard

The browser dashboard remains a local, loopback-only, read-only surface, but it
is secondary in v0.4.0. Crewlight Desktop is now the primary user-facing
product surface.

## When To Use It

Use the dashboard when you want:

- an extra browser view of current local sessions
- a second inspection surface while the desktop app is open
- direct daemon-only workflows without the desktop shell

Do not treat the dashboard as the required first-run path for ordinary Windows
users.

## Start

Advanced daemon-only usage still works:

```bash
crewlight daemon --dashboard --notifier none
```

The default loopback URL remains:

```text
http://127.0.0.1:3768/dashboard
```

The dashboard remains read-only, local-first, and restricted to `127.0.0.1` or
`::1`.

## Relationship To Crewlight Desktop

- Crewlight Desktop can start and stop the daemon for the user
- the desktop app and companion reuse the same loopback dashboard API for live
  current-session state
- opening the browser dashboard is optional and explicit

## Demo

The desktop app can run the same deterministic local demo that the CLI exposes:

```bash
crewlight demo multi-agent
```

Those six sessions are synthetic local demo data only.

## Boundaries

- No cloud service
- No prompts, transcripts, or tool I/O in the dashboard API
- No mutation API
- No SSE or WebSocket in v0.4.0
- No non-loopback binding
