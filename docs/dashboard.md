# Browser Dashboard

The dashboard is an optional, local, read-only view of the current daemon
process. The v0.3 design is a status-first daily-use surface rather than a
setup-first diagnostic page.

## Start

```bash
agentpulse daemon --dashboard
```

Prompt-derived task titles are disabled by default. To opt in locally:

```bash
agentpulse daemon --dashboard --dashboard-task-titles prompt-preview
```

This mode reads the documented `UserPromptSubmit.prompt` field from Claude Code
and Codex hooks only long enough to create a whitespace-normalized preview of
at most 60 Unicode code points. The complete prompt is not emitted, stored,
logged, forwarded, or returned by the dashboard API.

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
- six setup cards: Claude Code, Codex notify, Codex hooks, Cursor, OpenCode,
  and Antigravity probe;
- basic read-only doctor checks.

Action-needed cards place waiting input or permission states before failures and
rate limits, then order each group by the newest event. The complete status
overview retains the daemon's most-recent-first ordering.

Setup snippets and doctor checks remain available below the primary status
view. The Antigravity card is explicitly `research-only`: it prints a fixed,
minimal manual probe command for local investigation and does not make
Antigravity a supported setup platform or integration.

The Cursor card prints manual / experimental commands and a verification
command. A submitted Cursor event appears in the ordinary session overview and
the separate Electron companion with the `Cursor` display name and its selected
IDE extension, Desktop, or Manual surface.

### Compact Overview Mode

Select the compact browser view with:

```text
http://127.0.0.1:3768/dashboard?view=compact
```

Compact Mode shows the same current in-memory sessions as dense linked rows.
Each row includes the normalized status and attention state, display identity,
an optional safe status message, duration, relative last-seen time, and a
textual stale marker when applicable.

Rows are ordered with action states first, followed by errors, stale
non-terminal sessions, ordinary passive sessions, and completed sessions. The
newest event appears first within each group. This ordering changes only the
compact presentation; it does not change session status or attention.

Selecting a row opens Focus Mode while retaining `view=compact` in the URL, so
the return link goes back to Compact Mode. Compact Mode is a browser prototype
for a possible future floating or desktop status surface. It does not add a
desktop shell.

### Focus Mode

Select one current session with:

```text
http://127.0.0.1:3768/dashboard?focus=<sessionKey>
```

Focus Mode shows one expanded card and a link back to the overview. A key that
is not present in the current API response produces a focused-session-not-found
state. There is no historical lookup or stale-session recovery.

When `focus` and `view=compact` are both present, Focus Mode takes precedence.
The retained `view` parameter only determines whether the return link targets
Compact or Overview Mode.

The browser requests `/dashboard/api` every two seconds and also provides a
manual refresh button. This is ordinary HTTP polling. AgentPulse does not use
SSE or WebSocket.

Hook ingest may request `/dashboard/capabilities` to discover whether local
prompt-preview task titles are enabled. The route is read-only, dashboard-only,
and returns `Cache-Control: no-store`.

## Dashboard API

Each dashboard session retains its normalized allowlisted fields and adds
presentation-only derived fields:

- `displayName`;
- `displayWorkspace`;
- `shortSessionKey`, the final eight characters of the AgentPulse-owned
  `sessionKey`, or the complete key when shorter;
- `identityLine`, formatted as
  `<workspace> · <surface label> · #<shortSessionKey>`;
- optional `taskTitle`, copied only from an explicit normalized task title,
  whitespace-normalized, and limited to 120 characters;
- optional `activityLabel`, humanized from a known adapter event title or a
  narrow normalized status fallback;
- `durationMs`;
- `lastEventAgeMs`, clamped to zero when the event timestamp is in the future;
- `isStale`;
- optional `staleReason`, present only when the session is considered stale;
- `attention`, one of `passive`, `done`, `action`, or `error`;
- optional `actionKind`, either `input` or `permission`.

Surface labels are `CLI`, `IDE extension`, `Desktop`, `Cloud`, `Manual`, and
`Unknown`.

Staleness is a dashboard presentation heuristic based on time since the latest
event. `running` and `using_tool` become stale at five minutes,
`waiting_input` and `waiting_permission` at ten minutes, and `unknown` at two
minutes. Thresholds are inclusive. Completed, failed, idle, and rate-limited
sessions are never marked stale. This heuristic does not change status or
attention, recover sessions, inspect processes, or monitor whether an agent is
still running.

The attention mapping and future floating-mode direction are documented in
[Desktop Presence Product Design](product/desktop-presence.md).

## Security and Data Boundaries

- Dashboard routes exist only when the daemon starts with `--dashboard`.
- Dashboard responses set `Cache-Control: no-store`.
- The page uses a restrictive Content Security Policy and no external scripts,
  styles, frameworks, or CDNs.
- Session, setup, and doctor values are rendered with DOM `textContent`; they
  are never inserted as dynamic HTML.
- API sessions are explicitly serialized from normalized AgentPulse fields.
- Task titles never inspect event labels, arbitrary messages, command bodies,
  or unallowlisted platform fields.
- Prompt-preview task titles are generated only when the daemon starts with
  `--dashboard-task-titles prompt-preview`. The preview collapses whitespace,
  is capped at 60 Unicode code points, and replaces the current task title on a
  later `UserPromptSubmit`.
- Cards use `activityLabel` rather than rendering arbitrary `lastMessage` or
  error text as the primary session description.
- Complete platform payloads, prompts, transcripts, raw events, and tool
  input/output, including Codex input messages, are not included.
- Hook ingest discovers the opt-in mode from the same daemon host and port used
  for event delivery. Capability lookup times out after 200ms and fails closed
  to disabled without interrupting the host workflow.
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

The separate experimental Electron companion polls this dashboard API and can
open the browser dashboard only after an explicit user action. The dashboard
itself still does not add persistence, mutation APIs, SSE/WebSocket, automatic
config mutation, installers, or release automation. See
[Multi-Agent Companion Surface](companion-surface.md).

Existing Claude Code and Codex hook snippets do not need regeneration as long
as they invoke the updated AgentPulse binary or CLI.
