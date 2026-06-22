# Multi-Agent Companion Surface

The AgentPulse companion is a small, local Electron window for monitoring
multiple coding-agent sessions while working in other applications. It is a
compact status surface, not a replacement for the browser dashboard and not a
pet-first interface.

## Run

Install and build the workspace:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Start the daemon with its read-only dashboard API in one terminal:

```bash
node packages/cli/dist/index.js daemon --dashboard --notifier none
```

Start the companion in another terminal:

```bash
pnpm companion:dev
```

`pnpm companion:dev` is a development command and requires a source checkout;
it is not included in standalone preview archives.

To populate both the browser dashboard and companion with the built-in
multi-agent scenario, run in another terminal:

```bash
agentpulse demo multi-agent
```

The six sessions are synthetic local demo data with deterministic identities.
Rerun the command to refresh them, or restart the daemon to clear all in-memory
sessions.

The companion polls `http://127.0.0.1:3768/dashboard/api` every two seconds.
It honors `AGENTPULSE_HOST` only when the value is `127.0.0.1` or `::1`, and
honors a valid `AGENTPULSE_PORT`. The browser dashboard does not need to be
open, and the companion never opens it automatically.

The companion continues polling after failures. Polls do not overlap, and each
request has a timeout covering connection, response status, body reading, and
JSON parsing. A later successful poll replaces the failure state.

## Compact and expanded modes

Compact mode is a bottom-right command strip showing:

- the AgentPulse product mark and local-companion identity;
- the global status indicator and summary;
- running, action-needed, and failed counts;
- the highest-priority current session or connection diagnostic;
- expand, hide, and always-on-top controls.

Expanded mode adds a top status bar, filter chips, and a sorted list of current
sessions. Filters cover all sessions, attention-needed work, active work,
completed work, and failed or stale work. Filtering never changes the
underlying priority order.

Each session card shows only allowlisted dashboard presentation fields: agent
source, surface, normalized status, task title, workspace, safe activity label,
event age, attention state, and a short action or staleness hint. Offline,
dashboard-API-unavailable, empty, and no-filter-match states use dedicated
in-window guidance instead of appearing broken.

Offline and API-unavailable states can copy the fixed local startup command:

```bash
agentpulse daemon --dashboard --notifier none
```

Clipboard access is exposed through a narrow preload method and does not accept
arbitrary renderer text.

The existing `/dashboard` page remains the fallback for detailed inspection,
setup snippets, doctor results, and complete current-session cards.

## State priority

Daemon connectivity is separate from session state:

1. daemon unreachable: **Daemon offline**;
2. dashboard endpoint, HTTP response, JSON, or schema unavailable:
   **Companion API unavailable**;
3. reachable dashboard API: derive the summary from current sessions.

Session priority is:

1. permission needed;
2. user input needed;
3. failed or rate limited;
4. stale running or tool-use session;
5. running or using a tool;
6. completed within five minutes;
7. idle or older completed session;
8. unknown.

Equal-priority sessions are ordered by their newest event. Global session
summaries use the same ordering: **Needs you**, failure, **Possibly stale**,
`n running`, **Recently completed**, then **All quiet**.

Staleness remains a presentation heuristic. The companion does not inspect
agent processes, recover sessions, or determine whether an adapter is truly
connected.

## Troubleshooting

### Daemon offline

Start the local daemon and dashboard API, then leave the companion open to
reconnect on a later poll:

```bash
node packages/cli/dist/index.js daemon --dashboard --notifier none
```

This state also covers a request that exceeds the companion timeout, including
a response whose body starts but never finishes.

### Companion API unavailable

The companion reached a local HTTP server, but `/dashboard/api` returned a
non-success status, invalid JSON, or an unsupported schema. Confirm that the
same AgentPulse build is running with `--dashboard`, then restart the daemon if
needed. Response and error bodies are never shown in the companion.

### Host or port override ignored

Only `AGENTPULSE_HOST=127.0.0.1` and `AGENTPULSE_HOST=::1` are accepted. The
port must be an integer from 1 through 65535. An invalid host falls back to
`127.0.0.1`; an invalid port falls back to `3768`.

### Tray unavailable

Some Linux desktop environments do not provide a usable tray. When tray
creation fails, the window remains taskbar-accessible. Hide and window close
quit the companion so it cannot remain as an inaccessible background process.

## Window and tray behavior

The window is frameless, draggable, non-resizable, always on top by default,
and positioned near the primary display's bottom-right work area. It can
expand, collapse, and hide.

AgentPulse attempts to create a tray menu with Show/Hide, Always on Top, Open
Dashboard, and Quit. With a usable tray, Hide and window close hide the
companion and the tray can restore it. Without a usable tray, Hide and window
close quit.

Always on Top changes made from either the window or tray are reflected in the
window controls. Compact and expanded mode changes are owned by the main
process, so the renderer reflects only the accepted window state.

Open Dashboard runs only after an explicit window or tray action. Before
opening a browser, the main process verifies the configured URL is plain HTTP,
uses the configured `127.0.0.1` or `::1` loopback host and valid port, targets
exactly `/dashboard`, and has no credentials, query, or fragment.

The companion remains an experimental local surface. It is not an installer,
release artifact, background service, persistent history store, or agent
control interface.

## Security and privacy

The Electron renderer has Node integration disabled, context isolation and
sandboxing enabled, navigation blocked, and a restrictive Content Security
Policy. It loads local files only, denies permission requests, and accepts IPC
actions only from the companion's local main frame.

The main process validates `/dashboard/api`, projects it into a companion-only
view model, and sends only that view model across the preload bridge. The
renderer never receives raw API responses, `lastMessage`, error bodies,
prompts, transcripts, tool input/output, hook bodies, or platform payloads.

## Manual desktop verification

Run these checks in a real graphical desktop session:

1. Start the daemon with `--dashboard`, launch the companion, and confirm
   compact and expanded modes remain anchored on screen.
2. Toggle Always on Top from both the window and tray; confirm both controls
   stay synchronized.
3. With a usable tray, confirm Hide and window close hide the window and Show
   restores it.
4. In an environment without tray support, confirm the window remains
   taskbar-accessible and Hide or close exits the process.
5. Stop the daemon, start it without `--dashboard`, then start it correctly;
   confirm the companion moves through **Daemon offline**, **Companion API
   unavailable**, and a current-session state.
6. Select Open Dashboard and confirm only the configured local loopback
   `/dashboard` URL opens. Confirm no browser opens during startup or polling.
7. In an offline state, copy the daemon command and confirm the clipboard
   contains only `agentpulse daemon --dashboard --notifier none`.

This repository environment is headless. Build and pure runtime logic can be
verified here, but visible tray/window behavior remains manual verification for
the maintainer. No Windows, macOS, or Linux desktop behavior is claimed as
manually verified by this change.

## Screenshot checklist

Use a clean desktop background and capture the companion at native scale.

- Compact: show a meaningful current state, all three count cells, the primary
  session line, and the window controls without pointer hover or focus rings.
- Expanded: include at least four sessions covering attention, running,
  completed, and failed or stale states; keep source, workspace, status,
  activity, and age legible.
- Keep the companion fully on screen with its rounded border and shadow intact.
- Avoid prompts, transcripts, terminal output, secrets, personal paths, or
  unrelated desktop notifications in the frame.
- If documenting a connection problem, capture the dedicated offline or API
  unavailable state with the local command and actions visible.
- Record the platform, display scale, and whether the image is generated in a
  headless environment or captured manually.

## Prototype limits

- The daemon must be started separately with `--dashboard`.
- State is in memory only and disappears when the daemon stops.
- There is no autostart, installer, release artifact, or persistence.
- The companion displays permission needs but cannot approve or deny them.
- There is no SSE, WebSocket, cloud sync, new adapter, or agent-control path.
