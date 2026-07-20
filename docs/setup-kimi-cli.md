# Kimi CLI Integration Guide (Experimental)

Crewlight provides an integration adapter for Kimi CLI to monitor session execution states, tool invocations, and exit statuses.

> [!NOTE]
> This adapter is currently labeled as **Experimental** and relies on allowlisted event payloads.

## Setup Instructions

### 1. Print configuration snippet
Generate your hook configuration block by running:
```bash
crewlight setup kimi-cli --print
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
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kimi-cli"
          }
        ]
      }
    ],
    "BeforeTool": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kimi-cli"
          }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kimi-cli"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest kimi-cli"
          }
        ]
      }
    ]
  }
}
```

Merge this block into your global or workspace-specific Kimi CLI configuration.

### 3. Verify
Run `crewlight daemon --notifier console` and start a session using Kimi CLI. Verified statuses will route automatically to your local companion dashboard.
