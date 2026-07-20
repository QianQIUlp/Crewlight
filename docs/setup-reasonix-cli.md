# Reasonix CLI Integration Guide (Experimental)

Crewlight provides an integration adapter for Reasonix CLI to monitor session execution states, tool invocations, and exit statuses.

> [!NOTE]
> This adapter is currently labeled as **Experimental** and relies on allowlisted event payloads.

## Setup Instructions

### 1. Print configuration snippet

Generate your hook configuration block by running:

```bash
crewlight setup reasonix-cli --print
```

### 2. Output Snippet

The command will produce a mergeable JSON hook block similar to the following:

```json
{
  "hooks": {
    "start": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest reasonix-cli"
          }
        ]
      }
    ],
    "tool_use": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest reasonix-cli"
          }
        ]
      }
    ],
    "finish": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest reasonix-cli"
          }
        ]
      }
    ],
    "error": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest reasonix-cli"
          }
        ]
      }
    ]
  }
}
```

Merge this block into your global or workspace-specific Reasonix CLI configuration.

### 3. Verify

Run `crewlight daemon --notifier console` and start a session using Reasonix CLI. Verified statuses will route automatically to your local companion dashboard.
