# Repository Guidelines

## Project Structure & Module Organization

Crewlight is a pnpm TypeScript ESM monorepo targeting Node.js 22.

- `packages/core`: event schemas, normalization, session keys, and in-memory sessions.
- `packages/daemon`: HTTP server, configuration, and event ingestion service.
- `packages/notifier`: console, OS, and no-op notification outputs.
- `packages/adapters/*`: source-specific translators for Claude Code, Codex, and generic CLI commands.
- `packages/cli`: the `crewlight` executable and command handlers.
- `packages/shared`: shared runtime constants.
- `docs/`: architecture, integration boundaries, and setup guides.

Source belongs in `src/`; tests belong in the adjacent `test/` directory. Generated `dist/` output and `node_modules/` are not committed.

## Baseline Before Changes

Before making changes:

1. Check the current branch and working tree.
2. Inspect the relevant package scripts and source files.
3. Do not assume repository state from prior conversations or older plans.
4. Keep the change scoped to the user’s explicit request.

Do not add new platform adapters, UI surfaces, persistence, network streaming, config mutation, or background services unless the task explicitly asks for them.

## Build, Test, and Development Commands

Run commands from the repository root:

```bash
pnpm install --frozen-lockfile  # Install exactly from pnpm-lock.yaml
pnpm format:check               # Check Prettier formatting
pnpm typecheck                  # Run strict project-reference type checks
pnpm test                       # Run all Vitest suites once
pnpm build                      # Compile every package to dist/
pnpm format                     # Rewrite files with Prettier
```

After building, run the CLI locally with:

```bash
node packages/cli/dist/index.js
```

## Coding Style & Naming Conventions

Use strict TypeScript, ESM imports, two-space indentation, and Prettier defaults. Include `.js` extensions in relative TypeScript imports because the project uses `NodeNext`.

Use kebab-case filenames, PascalCase for classes and exported types, and camelCase for functions and variables. Keep package APIs explicit through each `src/index.ts`.

Prefer small, source-specific adapters. Adapters should translate platform payloads into safe Crewlight events; they should not perform notification, daemon storage, UI behavior, or user configuration mutation.

## Crewlight Data Safety Rules

Preserve the distinction between platform identity and Crewlight identity:

- `sessionId`: optional original identifier supplied by a platform or adapter.
- `sessionKey`: Crewlight-owned, namespaced, stable aggregation key.

Do not use an external `sessionId` directly as the internal `sessionKey`.

Never forward complete platform payloads, prompts, transcripts, tool input/output, Codex `input-messages`, or `rawEvent` into normalized events, sessions, notifier output, logs, or HTTP responses.

Only map whitelisted fields needed for status, identity, location, and short safe messages.

## Hook and Ingest Behavior

Platform ingest commands are called by external tools such as Claude Code hooks or Codex notify.

They must be safe and non-blocking:

- Malformed input should return a safe warning, not an unhandled exception.
- Unsupported events should be ignored without creating misleading sessions.
- Daemon connection failures should warn and return success where needed to avoid interrupting the host platform.
- Hook/notify commands must not expose raw payloads in stdout or stderr.
- Successful ingest should remain quiet unless the command explicitly requires output.

## Testing Guidelines

Vitest discovers `packages/**/test/**/*.test.ts`.

Name tests after the behavior or module under test. Cover:

- successful mappings
- malformed input
- unsupported events
- safe fallback behavior
- daemon unreachable behavior
- data-leak prevention
- notifier fallback behavior

Mock OS notification senders; tests must not trigger real desktop notifications.

Before committing, run all four checks:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects, such as:

- `feat: add optional OS notifier`
- `docs: document setup`
- `fix: harden codex ingest fallback`

Keep commits scoped and independently verified.

Create feature branches from the latest `main`; do not commit directly to `main`.

Pull requests should include:

- summary
- validation checklist
- manual verification where relevant
- explicit scope boundaries

Do not merge, enable auto-merge, delete branches, or force-push `main` unless explicitly requested.

## Security & Configuration

Do not automatically modify Claude or Codex user configuration. Setup commands should print mergeable snippets only.

Keep daemon defaults on loopback. Binding beyond loopback is only acceptable for trusted development environments and must not be made the default.

Native notifier import, runtime, callback, and timeout failures must degrade to safe warnings without failing daemon startup or ingestion.

Do not use private API reverse engineering, OCR, screen scraping, window watching, simulated clicks, or hidden platform behavior as a core integration strategy.
