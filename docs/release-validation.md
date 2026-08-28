# Source and Release Validation

Crewlight separates source validation from release artifact verification. This
keeps ordinary correctness checks portable while making the platform-specific
release evidence explicit.

## Prerequisites

Use Node.js 22.23.2 and the package manager version declared in the root
`package.json`:

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Source validation

Run the complete developer gate from the repository root:

```bash
pnpm validate
```

The command runs, in order:

1. Prettier formatting checks.
2. TypeScript project-reference type checking.
3. All Vitest suites.
4. The complete source build, including companion assets.

`pnpm test` remains a valid independent command. On a clean install it builds
the TypeScript project references before invoking Vitest, so workspace package
exports do not depend on a previous `typecheck` or `build` command.

CI runs `pnpm validate` on these native source targets:

| Target      | GitHub runner    |
| ----------- | ---------------- |
| Linux x64   | `ubuntu-latest`  |
| Windows x64 | `windows-latest` |
| macOS arm64 | `macos-15`       |
| macOS x64   | `macos-15-intel` |

The fixed macOS labels keep architecture-sensitive behavior explicit instead
of relying on a moving `macos-latest` architecture.

## Windows release verification

Build and verify the v0.5 release outputs on Windows x64:

```bash
pnpm release:verify
```

The supported v0.5 outputs are:

| Kind       | Output                                           |
| ---------- | ------------------------------------------------ |
| Standalone | `crewlight-v<version>-windows-x64.zip`           |
| Portable   | `crewlight-v<version>-windows-x64-desktop.zip`   |
| Installer  | `crewlight-v<version>-windows-x64-installer.exe` |

Each output has an adjacent SHA-256 sidecar and appears exactly once in the
generated `release-manifest.json`.

Before `pnpm release:verify`, run `pnpm release:node-runtime`. It downloads the
pinned official Node archive, verifies its SHA-256, and extracts the Node
binary and `LICENSE` from that same archive for the SEA build. Verification
smoke-tests the standalone executable with Node/npm/pnpm absent from its
runtime `PATH` and rejects missing or empty expected artifacts.

CI uploads standalone and desktop outputs separately. A fresh Windows evidence
runner downloads both uploads into an empty `release/` directory, verifies the
original manifest and sidecars without regenerating them, and expands the
Portable archive to require `Crewlight.exe`, `resources/app.asar`, and
`resources/crewlight-cli/crewlight.exe`.

Linux x64, macOS arm64, and macOS x64 remain blocking source-validation
targets. They do not run native release jobs and do not publish v0.5 binaries.

## Local Portable acceptance

Artifact verification is separate from desktop acceptance. The packaged
Portable archive has an acceptance record from the tested local Windows Server
2025 host covering:

- normal desktop launch;
- local service start and stop;
- a real Codex-shaped event;
- onboarding completion;
- deterministic demo data;
- read-only fixed-path Claude Code and Codex inspection; no automatic config
  write;
- the floating companion;
- no raw work content retained or exposed.

Claude Code and Codex setup remains a manual product instruction. This record
covers the Portable path. Installer-specific GUI behavior is unclaimed, while
CI artifact checks are recorded separately. A release is incomplete until its
manifest, sidecars, downloaded-file recheck, and local packaged Portable
acceptance all pass. Any artifact-affecting change invalidates the frozen
evidence.

`release-manifest.json` is generated from actual files and is not a
hand-maintained release list.
