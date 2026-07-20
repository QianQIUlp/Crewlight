# Pi Agent Integration Guide (Experimental)

Crewlight provides an integration adapter for Pi Agent to monitor session execution states, tool invocations, and exit statuses.

> [!NOTE]
> This adapter is currently labeled as **Experimental** and relies on allowlisted event payloads.

## Setup Instructions

### 1. Print configuration snippet

Generate your hook configuration block by running:

```bash
crewlight setup pi-agent --print
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
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest pi-agent"
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
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest pi-agent"
          }
        ]
      }
    ],
    "finish": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest pi-agent"
          }
        ]
      }
    ],
    "error": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/qiu/.local/share/mise/installs/node/22.23.1/bin/node /home/qiu/src/Crewlight/packages/cli/dist/index.js ingest pi-agent"
          }
        ]
      }
    ]
  }
}
```

Merge this block into your global or workspace-specific Pi Agent configuration.

### 3. Verify

Run `crewlight daemon --notifier console` and start a session using Pi Agent. Verified statuses will route automatically to your local companion dashboard.
