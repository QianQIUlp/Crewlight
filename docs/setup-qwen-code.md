# Qwen Code Integration Guide (Experimental)

Crewlight provides an integration adapter for Qwen Code to monitor session execution states, tool invocations, and exit statuses.

> [!NOTE]
> This adapter is currently labeled as **Experimental** and relies on allowlisted event payloads.

## Setup Instructions

### 1. Print configuration snippet

Generate your hook configuration block by running:

```bash
crewlight setup qwen-code --print
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
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qwen-code"
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
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qwen-code"
          }
        ]
      }
    ],
    "finish": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qwen-code"
          }
        ]
      }
    ],
    "error": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest qwen-code"
          }
        ]
      }
    ]
  }
}
```

Merge this block into your global or workspace-specific Qwen Code configuration.

### 3. Verify

Run `crewlight daemon --notifier console` and start a session using Qwen Code. Verified statuses will route automatically to your local companion dashboard.
