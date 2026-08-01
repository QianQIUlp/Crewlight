# SSH remote event ingest

Crewlight Desktop can receive agent events from explicitly selected SSH hosts through a reverse SSH tunnel. Remote support is opt-in and remains ingest-only: the tunnel accepts JSON `POST /events` requests and does not expose dashboard, session-read, or daemon-control endpoints to the remote host.

## How it works

1. **Host discovery:** Crewlight reads `~/.ssh/config` and includes only host blocks marked with `# CrewlightRemote: yes`.
2. **Host verification:** Crewlight verifies the SSH server key against `~/.ssh/known_hosts`, including ordinary and hashed entries. Unknown, changed, or revoked keys fail closed.
3. **Authentication:** Crewlight uses the block's `IdentityFile` when present and can fall back to the local SSH agent when `SSH_AUTH_SOCK` is available. Password prompts are not supported.
4. **Event forwarding:** The SSH server listens on remote `127.0.0.1:3768`; accepted event requests are forwarded to a loopback-only proxy and then to the local Crewlight daemon. Crewlight attaches the configured host alias locally.

The reverse listener is loopback-bound, but it is not process-authenticated. Any process or user on the selected remote host that can access its loopback port can submit allowed event fields and trigger local notifications. Marking a host therefore trusts that host's local users and processes for event ingest. The tunnel still cannot read sessions or expose the dashboard.

## Configure a host

Mark a concrete SSH host block in `~/.ssh/config`:

```text
Host devserver
  HostName 192.168.1.100
  User ubuntu
  IdentityFile ~/.ssh/id_ed25519
  # CrewlightRemote: yes
```

The marker may also appear immediately before the `Host` line. Use a single concrete alias rather than a wildcard block. Relative `IdentityFile` paths are resolved from the directory containing the SSH config file; `~/...` paths are resolved from your home directory.

Before connecting in Crewlight, connect once with OpenSSH:

```bash
ssh devserver
```

Review the server fingerprint and let OpenSSH add the verified key to `known_hosts`. If Crewlight later reports an unknown or changed host key, verify the host outside Crewlight and update `known_hosts` manually; Crewlight does not auto-trust or replace keys.

## Connect from Crewlight Desktop

1. Start the local Crewlight service.
2. Open **Settings → Remote**.
3. Select **Scan** to reload marked hosts.
4. Select **Connect** for the host.

Rescanning removes connections whose marked host block was removed or materially changed. Optional auto-connect applies only to hosts already discovered from the marked SSH configuration.

## Install the remote CLI

The remote host must have the `crewlight` CLI on `PATH`. Crewlight Desktop does not install it automatically and Crewlight does not publish an npm-installable CLI package.

If the desktop app reports that the CLI is missing, open the [Crewlight releases page](https://github.com/QianQIUlp/Crewlight/releases) and download the same Crewlight version shown by the dialog for the remote operating system and architecture. CLI archive names follow these patterns:

- Linux/macOS: `crewlight-v<version>-<os>-<arch>.tar.gz`
- Windows: `crewlight-v<version>-windows-<arch>.zip`

Download the matching `.sha256` file, verify the archive checksum, extract it, and place the `crewlight` executable in a directory on the remote host's `PATH`. On Linux or macOS, preserve or restore its executable bit. Reconnect after installation.

Do not copy the desktop application's bundled executable to a different operating system or architecture. Use the matching same-version CLI release artifact.

## Verify remote ingest

After the tunnel is connected, configure a supported agent adapter on the remote host and complete a real agent turn. Events sent to remote `http://127.0.0.1:3768/events` appear in the local dashboard with the SSH alias badge.

If events do not appear, verify that:

- the local Crewlight service is running;
- the remote CLI version matches the desktop version;
- the remote adapter loaded its hook configuration;
- `crewlight` resolves from the hook process's `PATH`;
- the SSH host key and authentication method are accepted.
