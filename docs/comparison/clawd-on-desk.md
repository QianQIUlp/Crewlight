# Competitive Boundary: Clawd on Desk

[Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) is a
pet-first desktop observer for coding agents. Its public project documentation
describes multi-agent coexistence, independent session tracking, a session HUD
and dashboard, permission bubbles for supported agents, and resolution of
multiple sessions into visible pet states.

Crewlight must not claim that Clawd supports only one agent or one session.
That is not a valid product distinction.

## Crewlight direction

Crewlight is a local-first, multi-agent status hub. Its companion surface is a
small command strip whose primary readable content is operational state:

- how many sessions are running;
- which session needs input or permission;
- which session failed or may be stale;
- what recently completed;
- whether the local daemon or dashboard API is unavailable.

The browser dashboard remains a read-only detail and diagnostic surface. The
companion exists so users can keep working elsewhere without keeping that
dashboard open.

The product distinction is emphasis and information architecture:

- Clawd is organized around an animated desktop pet and its interaction model.
- Crewlight is organized around multi-agent overview, attention routing,
  diagnostics, and low-friction local observability.

This is not a claim that either product exclusively owns a capability.

## Implementation boundary

Crewlight will not copy or adapt Clawd's:

- source code;
- assets or pixel art;
- themes or animation packs;
- mascot concept;
- exact layouts, interaction language, or visual state vocabulary.

The Crewlight companion uses its own status-ring visual, command-strip layout,
session ranking, normalized daemon API, security boundary, and restrained CSS
motion. Competitive research may inform product positioning, but implementation
must remain based on Crewlight's own repository, schemas, and design.
