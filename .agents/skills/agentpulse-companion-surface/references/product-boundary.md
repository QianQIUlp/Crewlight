# Product Boundary

## Product Contract

Keep Crewlight:

- **multi-agent-first**: summarize concurrent sessions across supported
  platforms;
- **attention-first**: answer which work can remain in the background and which
  session needs the user now;
- **local-first**: use the existing local daemon and loopback-only dashboard;
- **status-first**: show normalized identity, activity, timing, and attention
  without reproducing terminals or transcripts;
- **companion-like, not pet-first**: personality may support recognition, but
  it must not replace operational clarity.

Do not turn the surface into a general analytics dashboard, chat client,
terminal, agent controller, mascot platform, or plugin marketplace.

## Existing Runtime Baseline

Preserve these defaults unless the user explicitly authorizes a broader
change:

- The daemon owns normalized events and in-memory sessions.
- The dashboard is optional, read-only, and available only on loopback.
- The browser polls the existing dashboard API; it does not use SSE or
  WebSocket.
- Compact mode is a browser prototype for a possible future floating surface.
- Focus mode expands one current session and does not provide historical
  lookup.
- No persistence, restart recovery, retention policy, or session cleanup is
  implied.
- No desktop shell, tray process, background service, installer, or automatic
  configuration mutation is implied.

## Data Boundary

Display only explicit normalized or presentation-derived allowlisted fields.
Never expose:

- complete upstream payloads or raw events;
- prompts, transcripts, or complete input messages;
- tool input or output;
- command bodies, logs, secrets, or hidden platform state;
- arbitrary error or message text as the primary session identity.

Keep dynamic rendering on safe DOM APIs and `textContent`. Keep dashboard
responses `no-store`, preserve the restrictive content security policy, and do
not add external scripts, styles, fonts, or CDNs.

## Status and Attention Boundary

Do not change normalized status semantics to satisfy a visual design. Treat
attention as presentation derived from status:

- `waiting_input` and `waiting_permission` are actionable;
- `failed` and `rate_limited` are errors;
- `completed` is done;
- `running`, `using_tool`, `idle`, and `unknown` are passive.

Keep `unknown` neutral and low-confidence. Do not present it as healthy,
successful, actionable, or failed without additional normalized evidence.

## Authorization Gates

Require an explicit user request before introducing:

- Electron, Tauri, native windows, tray integration, or desktop packaging;
- persistence, history, cleanup, or lifecycle recovery;
- SSE, WebSocket, or another streaming transport;
- a framework, runtime dependency, animation dependency, or external asset;
- mutation APIs, agent control, plugin architecture, or config installation;
- a new platform adapter or changes to session identity and status contracts.

When a request crosses one of these gates, identify the boundary and keep
unrelated work scoped to the existing surface.
