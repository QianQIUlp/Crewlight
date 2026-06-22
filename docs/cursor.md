# Cursor Manual Bridge

Crewlight provides a manual, experimental Cursor bridge. It makes explicitly
reported Cursor activity visible in the browser dashboard and Electron
companion, but it does not automatically inspect Cursor or claim a stable
public lifecycle hook.

## Start Crewlight

Start the local daemon with the dashboard enabled:

```bash
crewlight daemon --dashboard --notifier none
```

In another terminal, print the Cursor command examples:

```bash
crewlight setup cursor --print
```

Crewlight prints commands only. It does not read or modify Cursor settings.
Run the commands from Cursor's integrated terminal or copy them into
user-defined tasks. Keep one stable `--session` value for commands that should
update the same Crewlight session.

## Flag mode

Report common states directly:

```bash
crewlight ingest cursor --event running --surface ide-extension --session cursor-crewlight --workspace Crewlight --title "Cursor working"
crewlight ingest cursor --event waiting-input --surface ide-extension --session cursor-crewlight --workspace Crewlight --title "Cursor needs review"
crewlight ingest cursor --event completed --surface ide-extension --session cursor-crewlight --workspace Crewlight --title "Cursor work completed"
crewlight ingest cursor --event failed --surface ide-extension --session cursor-crewlight --workspace Crewlight --title "Cursor work failed"
```

Allowed surfaces are `ide-extension`, `desktop`, and `manual`. The default is
`ide-extension`.

Supported event aliases are:

- `running`, `start`, `active`;
- `tool`, `using-tool`;
- `waiting-input`, `needs-review`, `review`;
- `waiting-permission`, `permission`;
- `completed`, `done`, `success`;
- `failed`, `error`;
- `rate-limited`;
- `idle`;
- `unknown`, `note`.

## JSON stdin mode

The same bridge accepts a lightweight JSON object:

```bash
printf '%s\n' '{
  "event": "running",
  "sessionId": "cursor-crewlight",
  "workspaceName": "Crewlight",
  "projectPath": "/path/to/project",
  "title": "Cursor working in Crewlight",
  "message": "Cursor manual bridge event",
  "timestamp": 1710000000000
}' | crewlight ingest cursor
```

Only the documented bridge fields are mapped. Unknown fields are discarded,
and `title` becomes the safe task title shown in Crewlight surfaces.

## Verify the GUI

Run the verification command printed by `crewlight setup cursor --print`, then
open the loopback dashboard or expand the companion. The session should show:

- source `Cursor`;
- the selected IDE extension, Desktop, or Manual surface;
- the supplied workspace and task title;
- the normalized running, action-needed, completed, failed, or other status.

## Boundaries

The Cursor bridge does not:

- install an extension or automatic hook;
- read prompts, transcripts, tool input/output, files, databases, extension
  storage, or private logs;
- watch windows, scrape the screen, use OCR, inject into processes, or depend
  on undocumented Cursor internals;
- modify Cursor settings;
- persist sessions or control Cursor.

Invalid input and daemon connection failures remain non-blocking so a terminal
or task workflow can continue.
