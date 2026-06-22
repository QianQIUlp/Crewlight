# Install Crewlight Without Node.js

The recommended v0.4.0 user path is a standalone Linux x64 or Windows x64
release archive. The executable embeds its Node runtime; users do not need
Node.js, npm, pnpm, Corepack, or the source repository.

## Supported Platforms

| Platform    | v0.4.0 release status                                |
| ----------- | ---------------------------------------------------- |
| Linux x64   | Supported and verified in CI                         |
| Windows x64 | Supported and verified by native Windows CI smoke    |
| macOS       | Planned / unverified; no supported binary is claimed |

## Linux x64

Download:

- [`crewlight-v0.4.0-linux-x64.tar.gz`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.4.0/crewlight-v0.4.0-linux-x64.tar.gz)
- [`crewlight-v0.4.0-linux-x64.tar.gz.sha256`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.4.0/crewlight-v0.4.0-linux-x64.tar.gz.sha256)

Verify and extract:

```bash
sha256sum --check crewlight-v0.4.0-linux-x64.tar.gz.sha256
tar -xzf crewlight-v0.4.0-linux-x64.tar.gz
cd crewlight-v0.4.0-linux-x64
./crewlight --help
```

The archive directory contains `crewlight`, `LICENSE`, and `BUILD-INFO.txt`.

## Windows x64

Download:

- [`crewlight-v0.4.0-windows-x64.zip`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.4.0/crewlight-v0.4.0-windows-x64.zip)
- [`crewlight-v0.4.0-windows-x64.zip.sha256`](https://github.com/QianQIUlp/Crewlight/releases/download/v0.4.0/crewlight-v0.4.0-windows-x64.zip.sha256)

Verify and extract in PowerShell:

```powershell
$expected = (Get-Content .\crewlight-v0.4.0-windows-x64.zip.sha256).Split()[0]
$actual = (Get-FileHash .\crewlight-v0.4.0-windows-x64.zip -Algorithm SHA256).Hash
if ($actual.ToLower() -ne $expected.ToLower()) { throw "Checksum mismatch" }

Expand-Archive .\crewlight-v0.4.0-windows-x64.zip -DestinationPath .\crewlight-v0.4.0-windows-x64
Set-Location .\crewlight-v0.4.0-windows-x64
.\crewlight.exe --help
```

The ZIP root contains exactly `crewlight.exe`, `LICENSE`, and
`BUILD-INFO.txt`. The executable is not claimed to be code-signed.

## Build provenance

`BUILD-INFO.txt` records the Crewlight version, exact Node 22.x runtime used by
CI, target platform and architecture, and commit SHA. This per-artifact file is
authoritative; release tooling does not hard-code a Node patch version.

## Optional PATH Installation

Linux example:

```bash
mkdir -p "$HOME/.local/bin"
install -m 0755 ./crewlight "$HOME/.local/bin/crewlight"
```

On Windows, move `crewlight.exe` to a user-controlled directory and add that
directory to the user `PATH`. For Codex hooks, use a simple no-space path such
as `C:\Users\<you>\Tools\Crewlight\crewlight.exe`; Codex CLI 0.141.0 cannot
reliably execute a `commandWindows` string that begins with a quoted executable
path.

Setup snippets default to the current executable's absolute path, so PATH
installation is not required for hooks. Windows Codex hooks setup fails closed
when that resolved path contains whitespace or command-sensitive characters.
To deliberately generate PATH-based snippets, pass `--binary crewlight`.

## Start Crewlight

Linux:

```bash
./crewlight daemon --dashboard
```

Windows:

```powershell
.\crewlight.exe daemon --dashboard
```

Open the printed loopback URL, normally
`http://127.0.0.1:3768/dashboard`. The dashboard always defaults to
`127.0.0.1` and rejects non-loopback hosts.

The default notifier is `console`. Use `--notifier none` for dashboard-only
operation. OS notification delivery has separate desktop-runtime requirements;
the Windows standalone smoke verifies the CLI and daemon, not visible Windows
toast delivery.

In another terminal, verify the running installation:

```bash
crewlight doctor
crewlight status
```

## Source Builds

Building from source remains supported for development, but it requires Node.js
22+, pnpm 10.11.0, and the repository toolchain. It is not the recommended
ordinary-user installation path.
