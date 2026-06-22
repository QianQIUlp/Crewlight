# v0.4.0 Release Checklist

Status: **Unreleased**

This checklist prepares the breaking Crewlight rebrand release. It requires the
release artifacts, screenshots, repository identity, and GitHub Release to all
line up before publication.

## Identity and documentation consistency

- [ ] Root and workspace package versions are `0.4.0`.
- [ ] CLI help displays `Crewlight v0.4.0`.
- [ ] Standalone artifact names and paths use `crewlight-v0.4.0-*`.
- [ ] README, README.zh-CN, install docs, dashboard docs, companion docs, and
      Cursor docs use Crewlight as the primary identity and `crewlight` as the
      primary command.
- [ ] The README and CHANGELOG include the breaking migration note.
- [ ] Historical changelog entries remain historical; active latest-version
      references use `0.4.0`.

## Safety and scope review

- [ ] Setup commands only print mergeable snippets and do not modify user
      configuration.
- [ ] No complete platform payloads, prompts, transcripts, tool input/output,
      Codex input messages, or raw events are exposed.
- [ ] Daemon and dashboard defaults remain restricted to loopback.
- [ ] Cursor remains documented as a manual / experimental bridge.
- [ ] Docs do not claim cloud sync, private API scraping, or automatic
      permission approval.

## Required validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm build:standalone`
- [ ] `pnpm smoke:standalone`
- [ ] Windows standalone CI smoke test passes on the release commit.

## Screenshot and UI gate

- [ ] Real dashboard and companion screenshots are captured from a GUI-capable
      environment after the Crewlight rename is applied.
- [ ] `assets/readme/dashboard-demo.png` shows the Crewlight dashboard with the
      multi-agent demo loaded.
- [ ] `assets/readme/companion-compact-demo.png` shows the compact companion
      with Crewlight branding and populated demo sessions.
- [ ] `assets/readme/companion-expanded-demo.png` shows the expanded companion
      with Crewlight branding, filters, and populated demo sessions.
- [ ] No fake, mocked, or manually composed screenshots are used.

## Exact-Commit Artifact Gate

- [ ] The release PR is merged into `main`.
- [ ] The merged release commit SHA is recorded.
- [ ] The `ci.yml` workflow succeeds on that exact merged release commit.
- [ ] The workflow run ID and original run URL are recorded before repo rename.
- [ ] Linux and Windows artifacts are downloaded from that exact workflow run.
- [ ] Each downloaded `BUILD-INFO.txt` reports version `0.4.0` and the exact
      merged release commit SHA.

## Repository Rename and Release

- [ ] `gh repo view QianQIUlp/AgentPulse --json nameWithOwner,viewerPermission`
      confirms `viewerPermission` is `ADMIN` before rename.
- [ ] The repository is renamed to `QianQIUlp/Crewlight`.
- [ ] `gh repo view QianQIUlp/Crewlight` succeeds after rename.
- [ ] Local `origin` is updated to
      `https://github.com/QianQIUlp/Crewlight.git`.
- [ ] All post-rename GitHub CLI commands explicitly target
      `--repo QianQIUlp/Crewlight`.
- [ ] The `v0.4.0` annotated tag is created and pushed only after artifact
      verification and repo rename.
- [ ] The GitHub Release `Crewlight v0.4.0` is created and the already-verified
      artifacts and checksums are uploaded.

## Old-Name Audit

- [ ] The pre-edit and post-edit old-name scans are archived.
- [ ] Remaining `AgentPulse`, `agentpulse`, `AGENTPULSE`, and `@agentpulse`
      references are listed with an explicit justification.

Do not publish the release if docs still present AgentPulse as the current
product name, if screenshots are missing or fake, if exact-commit artifacts
cannot be verified, or if the repository rename is incomplete.
