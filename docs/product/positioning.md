# Crewlight Product Positioning

> Crewlight is a local activity radar for AI coding agents.

## Product Center

Crewlight is a local-first visibility layer for concurrent coding-agent work.
Its first job is to answer:

- which agents are active
- which ones need attention
- which ones failed
- which ones may be stale

## v0.4.0 Surface Hierarchy

Crewlight v0.4.0 now presents that model through a desktop-first hierarchy:

1. **Crewlight Desktop** for the main local user experience
2. **Floating companion** for persistent glanceable status
3. **Browser dashboard** for secondary developer inspection
4. **CLI** for advanced setup, ingest, scripting, and standalone usage

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

The only persisted desktop data in v0.4.0 is bounded local UI preference data
such as theme, density, selected section, companion visibility preference, and
service auto-start preference.
