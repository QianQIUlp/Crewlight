# Crewlight Product Positioning

> Crewlight is a local-first activity radar for AI coding agents.

## Product Category

Crewlight is not primarily:

- a desktop pet;
- a generic notification tool;
- a full agent manager;
- a cloud observability platform;
- an IDE extension replacement.

It is closer to:

- a local activity radar;
- a multi-agent attention surface;
- a workflow visibility layer;
- a status and diagnostics boundary around AI coding agents.

The product collects bounded lifecycle signals from supported coding-agent
interfaces, normalizes them into a safe local state model, and presents the
current information through surfaces suited to different levels of attention.

## Core User Problem

Developers increasingly run multiple coding agents across terminals, IDEs,
worktrees, branches, cloud workspaces, and coding surfaces. The failure mode is
not just “no notification.” It is attention fragmentation:

- Which agent is active?
- Which one is waiting for input?
- Which one failed?
- Which one is stale?
- Which session belongs to which workspace?
- Which event deserves attention now?

Individual tools can report their own state, but developers still need a calm,
shared view that makes concurrent work legible without requiring them to keep
every terminal, IDE, or agent surface in the foreground.

## Product Thesis

The useful layer is not agent control first. The useful first layer is local,
read-only visibility and attention routing.

Crewlight should make current agent activity understandable before it attempts
to manage that activity. This keeps the core loop useful across platforms while
avoiding permission, orchestration, and adapter-fragility risks.

## Differentiation Pillars

### 1. Local-first by default

Crewlight defaults to a loopback-only daemon and local surfaces. It has no
cloud dependency, central account, or remote dashboard. Current session state
is held in memory and is not persisted by default.

Local-first is both a deployment choice and a trust boundary: status data stays
near the tools that produced it, and a useful baseline does not require a
hosted service.

### 2. Multi-agent-first

Crewlight is designed around multiple coding agents, sessions, workspaces, and
surfaces. It is not one mascot representing one assistant.

Source, surface, and session identity matter because useful attention routing
depends on distinguishing concurrent work. Crewlight-owned session keys keep
aggregation separate from platform-provided identifiers.

### 3. Attention routing, not raw logging

Crewlight translates supported lifecycle events into a small attention model:
`passive`, `done`, `action`, or `error`. The goal is to prioritize what needs
the user now, not to dump raw logs or reproduce agent transcripts.

Surfaces should remain quiet when work can stay in the background and become
clear when input, permission, failure recovery, or stale-work investigation may
be needed.

### 4. Adapter boundaries

Crewlight prefers official and public integration mechanisms. Adapters emit
only allowlisted status, identity, location, and short safe-message fields into
the normalized state model.

Core functionality must not depend on private API reverse engineering.
Experimental and research-only integrations must be labeled honestly and must
not be presented as verified support.

### 5. Read-only safety

The MVP observes, summarizes, and routes attention. It does not approve
permissions, mutate agent state, control turns, or manage agent processes.

This boundary limits the impact of adapter mistakes and preserves the host
agent's own trust and control mechanisms.

### 6. Progressive surfaces

Crewlight exposes the same safe current-state model through progressively
richer surfaces:

- CLI status for direct inspection and automation;
- a browser dashboard for overview, focus, setup, and diagnostics;
- an optional experimental Electron companion for persistent compact presence.

Future surfaces should reuse this model rather than introduce separate data
collection, privacy rules, or agent-control paths.

## What Crewlight Is Not

Crewlight is:

- not a Clawd clone;
- not a pet-first product;
- not an agent orchestrator;
- not a task scheduler;
- not a replacement for Claude Code, Codex, OpenCode, Cursor, or VS Code;
- not a cloud monitoring SaaS;
- not a private API wrapper.

These boundaries do not reject personality, richer local presentation, or new
documented adapters. They define the product's center of gravity: trustworthy
local visibility for concurrent agent work.

## Strategic Tension

- Too little personality makes Crewlight feel like a dry diagnostic tool.
- Too much personality turns it into a toy or pet and weakens operational
  trust.
- Too much control makes it unsafe and tightly coupled to fragile adapter
  behavior.
- Too much logging makes it noisy and increases privacy risk.

The intended balance is a calm local presence with useful attention routing.
Personality should support comprehension and approachability without obscuring
status, exaggerating certainty, or becoming the primary product value.

## Brand Direction

Crewlight should continue to satisfy all of these criteria:

- imply local presence, activity, attention, or a surface;
- not imply a cloud SaaS;
- not imply a pet-first product;
- not imply agent control or orchestration;
- work as a CLI, package, repository, and product name.

The brand should continue to imply local presence, activity, attention, and a
surface rather than cloud monitoring, mascot-first behavior, or agent control.

## Future Differentiation Candidates

### Near-term

- improve session identity;
- clarify workspace and worktree identity;
- produce manual dogfood reports;
- polish the attention model;
- verify the companion in real desktop environments;
- improve documentation and installation smoothness.

### Mid-term

- add richer local surfaces;
- publish an adapter capability matrix;
- improve privacy-preserving event summaries;
- consider optional local-only session history when strongly justified;
- document plugin-like adapter contracts.

Any history capability should remain optional, local, bounded, and supported by
a clear privacy and retention model.

### Avoid for now

- cloud sync;
- full task orchestration;
- permission approval;
- private API scraping;
- mascot-first animations;
- complex desktop packaging before the core loop is stable.

## Decision Rules

- If a feature improves local visibility without increasing control risk,
  consider it.
- If a feature requires private APIs, reject it or mark it research-only.
- If a feature adds persistence, require a privacy justification.
- If a feature makes Crewlight look like an agent controller, defer it.
- If a feature only improves aesthetics but not attention routing, defer it
  until the MVP loop is stable.
