# Source and Release Validation

Crewlight separates source validation from release artifact verification. This
keeps ordinary correctness checks portable while making the platform-specific
release evidence explicit.

## Prerequisites

Use Node.js 22 and the package manager version declared in the root
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

## Current-platform release verification

Build and verify the release outputs supported by the current host:

```bash
pnpm release:verify
```

This is a native build, not a cross-compilation command. Supported hosts and
outputs are:

| Host        | Standalone output               | Desktop output               |
| ----------- | ------------------------------- | ---------------------------- |
| Linux x64   | `.tar.gz` plus SHA-256 checksum | AppImage and deb             |
| Windows x64 | `.zip` plus SHA-256 checksum    | portable zip and NSIS `.exe` |
| macOS arm64 | `.tar.gz` plus SHA-256 checksum | arm64 DMG                    |
| macOS x64   | `.tar.gz` plus SHA-256 checksum | x64 DMG                      |

The command reuses the existing standalone and desktop packaging scripts,
smoke-tests the standalone executable with Node/npm/pnpm absent from its
runtime `PATH`, and rejects missing or empty expected artifacts. The Unix smoke
path supports both Linux and macOS and uses either `sha256sum` or the macOS
`shasum` implementation.

On Windows, the combined desktop packaging mode creates the portable archive
and installer after a single standalone build. CI uploads standalone and
desktop outputs under distinct artifact names; each macOS architecture runs in
its own native job, so one job cannot upload the other architecture's DMG.

## What remains manual

Artifact verification is not desktop acceptance testing. Before publishing a
release, verify on real target systems:

- desktop launch and lifecycle behavior;
- onboarding, service controls, companion controls, and preference persistence;
- installer and uninstall behavior;
- native notification delivery;
- platform signing, macOS notarization, and operating-system trust prompts;
- screenshots from the actual GUI.

Record those results in the versioned release checklist. A successful CI
artifact job must not be described as successful GUI verification.
