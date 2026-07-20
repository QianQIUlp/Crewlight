# Kiro CLI Integration Guide (Experimental)

Crewlight provides an integration adapter for Kiro CLI to monitor session execution states, tool invocations, and exit statuses.

> [!NOTE]
> This adapter is currently labeled as **Experimental** and relies on allowlisted event payloads.

## Setup Instructions

### 1. Print configuration snippet

Generate your hook configuration block by running:

```bash
crewlight setup kiro-cli --print
```

### 2. Output Snippet

The command will produce a mergeable JSON hook block similar to the following:

```json
{
  "hooks": {
    "onSessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kiro-cli"
          }
        ]
      }
    ],
    "onToolCall": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kiro-cli"
          }
        ]
      }
    ],
    "onComplete": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kiro-cli"
          }
        ]
      }
    ],
    "onError": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kiro-cli"
          }
        ]
      }
    ]
  }
}
```

Merge this block into your global or workspace-specific Kiro CLI configuration.

### 3. Verify

Run `crewlight daemon --notifier console` and start a session using Kiro CLI. Verified statuses will route automatically to your local companion dashboard.
