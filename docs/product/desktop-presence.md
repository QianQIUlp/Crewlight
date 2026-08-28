# Desktop Presence Product Design

## Purpose

Crewlight is a local-first Agent Attention Inbox for developers running
multiple Claude Code and Codex sessions. It answers three questions quickly:

- which agent needs me now?
- which agents are still running?
- which agent has failed or become stale?

The v0.5.0 Desktop shell is the primary product surface. The companion is a
glanceable view of the same sanitized snapshot, and the browser dashboard is a
secondary developer surface.

## Main Desktop Window

The top-level navigation is intentionally small:

- `Home` — the complete visible inbox, sorted by Attention priority
- `Connect` — Claude Code and Codex setup; other integrations are experimental
- `Troubleshooting` — service, configuration, notification, event, and
  diagnostic controls
- `Settings` — notifications, startup, companion, language, appearance,
  About, and Remote Beta

The main window owns service control, onboarding, demo orchestration, and
companion control. It does not turn Crewlight into an agent orchestrator.

## Floating Companion

The companion reuses the same safe current-session model as Home and the
dashboard API. It may show source, surface, status, Attention priority, a task
or workspace label, activity, and relative freshness. It never shows prompts,
transcripts, tool I/O, or raw payloads.

## Attention Model

The core Attention Engine is the only policy source:

| Session state                          | Priority       | Action kind  | Visibility         |
| -------------------------------------- | -------------- | ------------ | ------------------ |
| `waiting_input`                        | `needs_action` | `input`      | continuous         |
| `waiting_permission`                   | `needs_action` | `permission` | continuous         |
| `failed`                               | `error`        | `failed`     | until new activity |
| `rate_limited`                         | `error`        | `rate_limit` | until new activity |
| recent `running` / `using_tool`        | `active`       | —            | current signal     |
| stale `running` / `using_tool`         | `stale`        | —            | until refreshed    |
| recent `completed`                     | `ready`        | `ready`      | ten minutes        |
| expired `completed`, `idle`, `unknown` | `hidden`       | —            | diagnostics only   |

Priority order is `needs_action > error > stale > active > ready > hidden`.
The same status does not notify twice merely because an event ID changed;
reopened sessions enter a new status and may notify again. `readyDismissedBefore`
is a global timestamp preference, so clearing completed turns never deletes a
session or hides a future turn.

## Persistence Boundary

Desktop may persist bounded local UI preferences such as theme, density, last
section, companion visibility, auto-start, locale (`system`, `en`, `zh-CN`),
and `readyDismissedBefore`. It does not persist prompts, transcripts, raw
events, tool I/O, private agent payloads, or session history.

## Accessibility and Remote

Native semantic controls, keyboard focus, reduced motion, forced colors, and
200% text scaling are required. Remote remains Beta and clearly warns that
connecting trusts the remote host's local process.
