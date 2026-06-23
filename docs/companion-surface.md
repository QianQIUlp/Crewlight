# Desktop Companion Surface

The floating companion is part of Crewlight Desktop in v0.4.0. It is no longer
the whole product and no longer an experimental source-checkout-only surface.

## Role

The companion is the persistent quick-look surface. The main desktop window is
the command center; the companion is the glanceable status strip.

It continues to show only safe, allowlisted current-session fields:

- source
- surface
- status
- task title or workspace label
- activity label
- relative freshness
- action or staleness hints

It does not display prompts, transcripts, tool input or output, raw events, or
private payloads.

## Control Model

Crewlight Desktop controls the companion through:

- show
- hide
- bring to front
- compact mode
- expanded mode
- always-on-top toggle

The companion shares the same local daemon snapshot as the main window. It does
not introduce a second transport, streaming channel, persistence layer, or
agent-control path.

## Lifecycle

- The companion is created by the desktop app
- it can remain hidden until the user asks for it or enables the visibility preference
- it reflects the same local session model as `Home`
- it can still open the secondary browser dashboard explicitly

## Verification

In a GUI-capable environment, verify:

1. the companion opens from the desktop app
2. compact and expanded modes resize correctly
3. always-on-top stays synchronized with the main window controls
4. demo sessions appear in both the main window and the companion
5. hide, show, and bring-to-front work from both the main window and tray
