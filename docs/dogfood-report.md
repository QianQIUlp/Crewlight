# v0.5.0 Verification Record

This record distinguishes repository evidence from acceptance evidence. It is
not a claim that v0.5.0 has been released or that Windows support has passed.

## Current status

| Area                                                  | Current evidence                                                                            | Release state                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| Core normalization, retention, Attention Engine       | Automated unit tests and type checks                                                        | Ready for targeted review             |
| Claude Code and Codex adapters                        | Sanitized fixtures plus adapter/CLI tests; Codex Hooks and legacy notify are separate paths | Ready for real-turn verification      |
| Daemon, dashboard, notifier fallback                  | Automated service, HTTP, dashboard, and notifier tests                                      | Ready for targeted review             |
| Desktop preferences, onboarding, companion projection | Automated state, sanitization, lifecycle, and read-only inspection tests                    | Ready for Windows GUI verification    |
| SSH Remote                                            | Existing automated tests; Remote remains Beta                                               | Not a v0.5 Supported claim            |
| Native OS notifications                               | Mocked and fallback-tested; no local delivery claim here                                    | Requires Windows desktop verification |
| Installer and Portable artifacts                      | CI scripts pin and verify inputs, names, sidecars, and manifest                             | Requires CI plus Windows acceptance   |

## Required release evidence

Before publishing, attach evidence from the same frozen artifacts for both a
physical Windows 11 x64 machine and a clean Azure Windows 11 x64 VM. Record the
OS build, commit, artifact SHA-256, time, and results for install/upgrade,
managed daemon start/stop, tray behavior, Claude Code and Codex real turns,
notifications, Inbox ordering, onboarding, keyboard access, forced colors,
reduced motion, and 200% text scaling.

Automated green checks do not substitute for that evidence. Until it exists,
`release-policy.json` remains `candidate`, Windows remains an unsigned target,
and the site/README must not show a download CTA.

## Safe manual checklist

1. Start the local daemon and confirm the loopback health endpoint.
2. Copy and manually merge only the fixed Claude Code or Codex user-level hook
   definition, then inspect that path read-only.
3. Review Codex definitions in `/hooks`; detecting a definition is not a
   live-event assertion.
4. Run a real turn, then verify waiting, failure, stale, completed/ready, and
   reopen transitions without exposing prompts, transcripts, reasoning, or tool
   I/O.
5. Capture platform-specific evidence separately from repository test output.
