# Agent Adapter Research

This note records evidence boundaries for the OpenCode, Codex Desktop, and
Antigravity work. An available interface is not treated as verified Crewlight
support until the generated integration has been exercised against the real
product.

## Support matrix

| Platform surface        | Crewlight level                                            |
| ----------------------- | ---------------------------------------------------------- |
| Claude Code hooks       | `supported`                                                |
| Codex CLI hooks         | `supported` after real Windows testing                     |
| OpenCode CLI/TUI plugin | Implemented, pending real local verification               |
| OpenCode Desktop        | `experimental`; may share the plugin runtime               |
| Codex Desktop           | `experimental`; reuses Codex hooks                         |
| Antigravity CLI/Desktop | `research-only`; probe command is not a stable integration |

The level names used in Crewlight documentation are `supported`,
`experimental`, `research-only`, and `unsupported`. OpenCode remains below
`supported` until a real local verification confirms plugin loading, event
delivery, and non-blocking failure behavior.

## OpenCode

### Officially confirmed

- [OpenCode plugin documentation](https://opencode.ai/docs/plugins/) says local
  JavaScript or TypeScript plugins load from `.opencode/plugins/` and
  `~/.config/opencode/plugins/`.
- The same documentation lists session, permission, message, and tool events
  used by this adapter.
- [OpenCode Windows guidance](https://opencode.ai/docs/windows-wsl/) recommends
  WSL for the best Windows experience while noting native Windows operation.

### Public repository evidence

The public [OpenCode repository](https://github.com/anomalyco/opencode)
defines plugin event payloads with session identifiers and status types. The
Crewlight implementation follows those public shapes conservatively and
forwards only whitelisted identity and status metadata.

### Local experiment required

- Confirm project and global plugin loading.
- Confirm each mapped event fires in the installed OpenCode version.
- Confirm the generated `Bun.spawn` invocation remains detached and silent.
- Test native Windows, WSL, and OpenCode Desktop separately.

### Current Crewlight level

OpenCode CLI/TUI plugin: implemented, pending real local verification before a
`supported` label. OpenCode Desktop: `experimental`.

## Codex Desktop

### Officially confirmed

- [Codex hooks documentation](https://developers.openai.com/codex/hooks)
  documents active config layers, command hooks, trust review, and Windows
  command overrides.
- [Codex app settings](https://developers.openai.com/codex/app/settings) says
  app agents inherit the same configuration as the IDE and CLI extension.
- The Codex changelog documents an in-app hooks trust review flow.

### Local experiment required

Crewlight has not verified that every Desktop thread runs the same hook events
with the same payload and working-directory behavior as Codex CLI.

### Current Crewlight level

`experimental`. It reuses the Codex adapter with `source=codex` and an explicit
`surface=desktop`; no separate Desktop adapter exists.

## Antigravity

### Officially confirmed

The [Google transition announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
confirms Antigravity CLI, Antigravity 2.0, and retained hook/plugin
customization concepts. A
[hooks documentation URL](https://antigravity.google/docs/hooks) is visible.

### Not confirmed

Crewlight has not verified readable hook documentation content, a hooks
configuration shape, payload schema, command execution contract, or whether
CLI and Desktop share configuration and runtime behavior.

### Local experiment required

Follow the checklist in [Antigravity research](../antigravity.md) without
capturing prompts, transcripts, tool input/output, credentials, or file
contents.

### Current Crewlight level

`research-only`. The probe command is diagnostic scaffolding, not a stable
adapter or setup path.
