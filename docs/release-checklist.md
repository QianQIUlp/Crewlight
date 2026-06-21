# v0.3.0 Release Checklist

Status: **Unreleased**

This checklist prepares the v0.3.0 release candidate. It does not authorize a
tag, GitHub Release, merge, or publication step.

## Version and documentation consistency

- [ ] Root and workspace package versions are `0.3.0`.
- [ ] CLI help displays `AgentPulse v0.3.0`.
- [ ] CI standalone artifact names and paths use `v0.3.0`.
- [ ] `CHANGELOG.md` keeps v0.3.0 marked `Unreleased`.
- [ ] Historical version-specific documentation retains its original versions.
- [ ] Public install instructions continue to reference the latest published
      release until v0.3.0 assets exist.
- [ ] Known limitations describe OpenCode as pending real local verification,
      Codex Desktop as experimental, and Antigravity as research-only.

## Safety and scope review

- [ ] Setup commands only print mergeable snippets and do not modify user
      configuration.
- [ ] No complete platform payloads, prompts, transcripts, tool input/output,
      Codex input messages, or raw events are exposed.
- [ ] Daemon and dashboard defaults remain restricted to loopback.
- [ ] The release freeze adds no persistence, GUI, adapter, protocol, streaming,
      background-service, or dashboard-redesign work.

## Required validation

- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Standalone CI artifacts

- [ ] Linux CI produces `agentpulse-v0.3.0-linux-x64.tar.gz` and its checksum.
- [ ] Windows CI produces `agentpulse-v0.3.0-windows-x64.zip` and its checksum.
- [ ] Both standalone smoke tests pass.
- [ ] Each `BUILD-INFO.txt` reports version `0.3.0`, the build commit, runtime,
      platform, and architecture.

## Deferred release steps

Perform these only in an explicitly authorized release task:

- [ ] Confirm the release commit and all required CI jobs.
- [ ] Create and push the `v0.3.0` tag.
- [ ] Create the GitHub Release and upload verified standalone assets.
- [ ] After the v0.3.0 assets exist, update public README and install commands
      from the latest previously published version to v0.3.0.
- [ ] Replace `Unreleased` with the release date.

Do not merge, tag, publish, create a GitHub Release, or enable automatic
configuration changes as part of the release-freeze PR.
