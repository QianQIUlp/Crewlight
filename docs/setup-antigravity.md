# Antigravity CLI Integration Guide

Crewlight syncs with the Antigravity CLI (agy) to monitor agent actions and tool execution.

## Safety and Interception Limits

As defined in the data safety boundaries, Crewlight's integration is strictly **read-only and status-driven**. It:
1. Observes tool execution and start/end events to render dashboard status.
2. Does **not** intercept or prompt for permissions on behalf of the agy platform.
3. Excludes all private context, prompt texts, and tool transcripts from transmission.

## Setup Instructions

### 1. Print configuration snippet
Run:
```bash
crewlight setup antigravity --print
```

### 2. Configure agy hooks
Merge the output JSON into your agy config at `~/.gemini/config/hooks.json` or your local workspace hook config.

### 3. Verify
Run `crewlight daemon` and execute a short task in agy to observe live status mapping on the companion dashboard.
