# Copilot CLI Integration Guide

Crewlight provides a dedicated adapter for the Copilot CLI. It listens to lifecycle event hooks and maps them safely to visual cards on the local dashboard.

## Setup Instructions

### 1. Print configuration snippet
Generate your hook configuration block by running:
```bash
crewlight setup copilot-cli --print
```

### 2. Configure Copilot hooks
Open your Copilot CLI configuration file at `~/.copilot/settings.json` (Windows: `%USERPROFILE%\.copilot\settings.json`) or a project-specific `.copilot/settings.json`, and insert/merge the printed JSON hook commands.

### 3. Verify connection
Start the Crewlight service:
```bash
crewlight daemon --notifier console
```

Run a simple test command with Copilot CLI. You should observe status transitions (e.g., from `SessionStart` to `PreToolUse` when invoking commands) appearing on your companion dashboard.
