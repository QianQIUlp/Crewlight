# Desktop Presence Product Design

## Purpose

AgentPulse should translate normalized agent activity into a clear answer to a
daily question: which agents can stay in the background, and which ones need
attention now?

The browser dashboard is the v0.3 proving ground for this attention model. It
remains a local, loopback-only, read-only surface backed by the current daemon
process.

## Overview Mode

Overview Mode is the default `/dashboard` view. It shows:

- a compact daemon summary;
- an **Action needed** section for sessions that need user action or have
  encountered an error;
- cards for every current in-memory session;
- setup snippets and doctor output after the primary status content.

Action-needed sessions are ordered by attention value, with actionable waiting
states before errors, and then by the newest event. The complete overview keeps
the daemon's existing most-recent-first session order.

Each card communicates the agent, workspace, normalized status, safe short
message, duration, and last update. It does not attempt to reproduce an agent
transcript or terminal.

## Focus Mode

Focus Mode is selected with:

```text
/dashboard?focus=<sessionKey>
```

It shows one expanded current session and a link back to Overview Mode. If the
key is not present in the current `/dashboard/api` response, the dashboard
shows a focused-session-not-found state.

Focus Mode does not introduce historical lookup, persistence, or stale-session
cleanup. Like Overview Mode, it reflects only the sessions held by the current
daemon process.

## Attention Model

Attention is derived for presentation and does not change the normalized core
status:

| Status               | Attention | Action kind |
| -------------------- | --------- | ----------- |
| `running`            | passive   | —           |
| `using_tool`         | passive   | —           |
| `idle`               | passive   | —           |
| `unknown`            | passive   | —           |
| `completed`          | done      | —           |
| `waiting_input`      | action    | input       |
| `waiting_permission` | action    | permission  |
| `failed`             | error     | —           |
| `rate_limited`       | error     | —           |

`unknown` uses passive attention routing because it does not provide an
actionable instruction. Its visual treatment must remain neutral and
low-confidence rather than implying a healthy or successful state.

Duration is derived as follows:

- start at `startedAt`, falling back to `lastEventAt`;
- end at the current time for running, tool-use, and waiting states;
- end at `completedAt`, falling back to `lastEventAt`, for completed and failed
  states;
- end at `lastEventAt` for idle, unknown, and rate-limited states;
- clamp the result to zero.

## Future Compact and Floating Mode

A future Compact/Floating Mode may present a small always-available status
surface using the same attention contract. It should prioritize action and
error states while making passive activity glanceable.

Desktop windows, tray integration, lifecycle management, installers, and
platform-specific notification behavior are deliberately deferred to a later
experimental PR. This PR does not add Electron, Tauri, a background desktop
service, or any other desktop shell.

## Privacy and Security Boundaries

The dashboard API continues to serialize an explicit allowlist of normalized
session fields plus derived display fields. It must not expose:

- complete platform payloads or raw events;
- prompts or transcripts;
- tool input or output;
- complete Codex input messages;
- hidden platform state.

Dashboard values are rendered through DOM construction and `textContent`. The
surface remains loopback-only, uses no external scripts, frameworks, or CDNs,
keeps its restrictive Content Security Policy, and returns
`Cache-Control: no-store`.
