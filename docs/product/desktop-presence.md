# Desktop Presence Product Design

## Purpose

Crewlight should answer one local workflow question quickly:

> which agents can stay in the background, and which one needs me now?

In v0.4.0 that answer is delivered primarily through Crewlight Desktop, with
the floating companion as the glanceable secondary surface and the browser
dashboard as a secondary developer surface.

## Main Desktop Window

The desktop shell is the primary product surface. It combines:

- `Home` command center
- `Doctor`
- `Agents`
- `Companion`
- `Demo`
- `Appearance`
- `Settings`
- `About`

The main window owns service control, demo orchestration, onboarding, and
companion control. It does not turn Crewlight into an agent orchestrator.

## Floating Companion

The companion remains the compact persistent surface. It reuses the same safe
current-session model as the desktop shell and the dashboard API:

- global summary
- running count
- needs-attention count
- failure count
- highest-priority current session

Expanded mode adds a sorted dense current-session list. The companion still
does not show prompts, transcripts, tool I/O, or raw payloads.

## Browser Dashboard

The browser dashboard remains useful, but its role is secondary:

- loopback-only
- read-only
- current-session-only
- developer-facing

It is no longer the primary first-run experience for ordinary Windows users.

## Attention Model

The attention model still derives from normalized status:

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

## Persistence Boundary

Crewlight Desktop may persist bounded local UI preferences such as:

- theme
- accent
- density
- last selected section
- companion visibility preference
- current-session desktop auto-start preference

It does not persist prompts, transcripts, raw events, tool I/O, private agent
payloads, or session history in v0.4.0.
