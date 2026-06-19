# Install AgentPulse Without Node.js

The recommended v0.2.2 user path is the standalone Linux x64 release archive.
The installed `agentpulse` executable embeds its Node runtime; users do not need
Node.js, npm, pnpm, Corepack, or the source repository.

## Supported Platform

| Platform  | v0.2.2 release status                                       |
| --------- | ----------------------------------------------------------- |
| Linux x64 | Supported and verified in CI                                |
| Windows   | Planned / unverified; no supported v0.2.2 binary is claimed |
| macOS     | Planned / unverified; no supported v0.2.2 binary is claimed |

Do not treat the Windows or macOS source-build instructions as standalone
binary support.

## Download and Verify

Download these files from
[GitHub Releases](https://github.com/QianQIUlp/AgentPulse/releases):

- `agentpulse-v0.2.2-linux-x64.tar.gz`
- `agentpulse-v0.2.2-linux-x64.tar.gz.sha256`

Keep both files in the same directory, then run:

```bash
sha256sum --check agentpulse-v0.2.2-linux-x64.tar.gz.sha256
tar -xzf agentpulse-v0.2.2-linux-x64.tar.gz
cd agentpulse-v0.2.2-linux-x64
./agentpulse --help
```

The archive contains:

- `agentpulse`: the standalone executable
- `BUILD-INFO.txt`: exact build provenance
- `LICENSE`: project license

`BUILD-INFO.txt` records the AgentPulse version, the actual Node 22.x runtime
selected by CI for that build, Linux/x64 target information, and the commit
SHA. This per-artifact file is authoritative; the project does not hard-code a
Node 22 patch version in release tooling.

## Optional PATH Installation

To invoke `agentpulse` without a relative path:

```bash
mkdir -p "$HOME/.local/bin"
install -m 0755 ./agentpulse "$HOME/.local/bin/agentpulse"
```

Ensure `$HOME/.local/bin` is in `PATH`, then verify:

```bash
agentpulse --help
```

## Start AgentPulse

Start the daemon and browser dashboard:

```bash
agentpulse daemon --dashboard
```

Open the printed loopback URL. The default is:

```text
http://127.0.0.1:3768/dashboard
```

The default notifier is `console`. Use `--notifier none` for dashboard-only
operation, or `--notifier os` when the Linux desktop session has a working
`notify-send` installation.

In another terminal, verify the running installation:

```bash
agentpulse doctor
agentpulse status
```

## Source Builds

Building from source remains supported for development, but it requires Node.js
22+, pnpm 10.11.0, and the repository toolchain. It is not the recommended
ordinary-user installation path. See the README's Developer Setup section.
