# Crewlight Product Positioning

> Crewlight is a local Agent Attention Inbox for concurrent coding work.

## Product Center

Crewlight is a local-first visibility layer for concurrent coding-agent work.
Its first job is to answer:

- which agents are active
- which ones need attention
- which ones failed
- which ones may be stale

## v0.5.0 Surface Hierarchy

Crewlight v0.5.0 presents that model through a compact Windows-first hierarchy:

1. **Home / Inbox** for the main local user experience
2. **Connect** for Claude Code and Codex setup
3. **Troubleshooting** for service, diagnostics, and developer dashboard access
4. **Settings** for bounded preferences and Remote Beta

The product is no longer positioned as a CLI-first tool with an optional tiny
Electron experiment attached to it.

## Boundaries

Crewlight is still:

- local-first
- multi-agent-first
- attention-first
- read-only with respect to agent control

Crewlight is still not:

- a cloud observability SaaS
- an agent orchestrator
- a permission approver
- a private API scraper
- a transcript archive

## Data Safety

Crewlight continues to avoid forwarding:

- prompts
- transcripts
- tool input or output
- raw platform payloads
- hidden private platform state

The only persisted desktop data is bounded local UI preference data such as
theme, density, locale, selected section, companion visibility, readiness
dismissal timestamp, and service auto-start preference.
