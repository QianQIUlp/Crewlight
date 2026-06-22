## Summary

- Initialize TypeScript pnpm monorepo
- Add core event normalization and session store
- Add local daemon with event and session endpoints
- Add console notifier policy
- Add generic CLI command monitoring
- Add crewlight CLI commands
- Add v0.1 documentation and verification steps

## Validation

- [ ] pnpm format:check
- [ ] pnpm typecheck
- [ ] pnpm test
- [ ] pnpm build
- [ ] Manual: crewlight daemon
- [ ] Manual: crewlight emit
- [ ] Manual: crewlight status
- [ ] Manual: crewlight run success
- [ ] Manual: crewlight run failure

## Scope boundaries

- No desktop app
- No VS Code / Cursor extension
- No Claude Code adapter
- No Codex adapter
- No OpenCode adapter
- No persistence
- No SSE or WebSocket
- No OS notification
- No session GC
