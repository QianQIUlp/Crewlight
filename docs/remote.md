# SSH Remote Tunneling & Event Ingest

Crewlight enables zero-config monitoring of agents running on remote development servers via secure, lazy-loaded SSH tunnels.

## How It Works

1. **Host Discovery**: Crewlight parses your local `~/.ssh/config` to look for designated hosts.
2. **Tunneling**: When you connect, Crewlight sets up a local HTTP listener and binds it to a remote port forward (`127.0.0.1:3768`) on the remote server over SSH.
3. **Session Tagging**: Remote event requests include the alias, which Crewlight dashboard renders as a distinct `🌐 host-alias` badge.

## Setup Instructions

### 1. Tag your SSH host
Add a `# CrewlightRemote: yes` comment inline to your designated host block in `~/.ssh/config`:

```text
Host devserver
  HostName 192.168.1.100
  User ubuntu
  IdentityFile ~/.ssh/id_ed25519
  # CrewlightRemote: yes
```

*Note: Only public-key authentication is supported. Make sure your identity file is loaded or config path is correct.*

### 2. Connect in the Desktop App
- Launch Crewlight Desktop and navigate to `Settings -> Remote`.
- Click **Scan** (or restart the app) to discover your tagged hosts.
- Click **Connect**.
- If `crewlight` is not installed on the remote machine, a dialog will appear showing the remote CLI installation snippet. Paste it into your remote terminal to install `crewlight` on the server.

### 3. Observe remote events
Run any compatible agent CLI (e.g. Claude Code or Gemini CLI) on your remote server. The events will flow over the tunnel and appear on your local machine tagged with the host's glob icon and name chip.
