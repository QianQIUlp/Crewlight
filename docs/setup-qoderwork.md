# Qoderwork Integration Guide (Experimental)

Crewlight provides an integration adapter for Qoderwork to monitor session execution states, tool invocations, and exit statuses.

> [!NOTE]
> This adapter is currently labeled as **Experimental** and relies on allowlisted event payloads.

## Setup Instructions

### 1. Print configuration snippet

Generate your hook configuration block by running:

```bash
crewlight setup qoderwork --print
```

### 2. Output Snippet

The command will produce a mergeable JSON hook block similar to the following:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qoderwork"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qoderwork"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qoderwork"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qoderwork"
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qoderwork"
          }
        ]
      }
    ]
  }
}
```

Merge this block into your global or workspace-specific Qoderwork configuration.

### 3. Verify

Run `crewlight daemon --notifier console` and start a session using Qoderwork. Verified statuses will route automatically to your local companion dashboard.
