# v0.5.0 Verification Record

This record distinguishes repository evidence from local acceptance evidence.
v0.5.0 remains a Windows-first candidate, and its release artifacts remain
unsigned.

## Current status

| Area                                                  | Current evidence                                                                            | Release state                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Core normalization, retention, Attention Engine       | Automated unit tests and type checks                                                        | Ready for targeted review                                   |
| Claude Code and Codex adapters                        | Sanitized fixtures plus adapter/CLI tests; Codex Hooks and legacy notify are separate paths | Ready for real-turn verification                            |
| Daemon, dashboard, notifier fallback                  | Automated service, HTTP, dashboard, and notifier tests                                      | Ready for targeted review                                   |
| Desktop preferences, onboarding, companion projection | Automated state, sanitization, lifecycle, and read-only inspection tests                    | Local Portable acceptance recorded                          |
| SSH Remote                                            | Existing automated tests; Remote remains Beta                                               | Not a v0.5 Supported claim                                  |
| Native OS notifications                               | Mocked and fallback-tested; no local delivery claim here                                    | Requires Windows desktop verification                       |
| Installer and Portable artifacts                      | CI scripts pin and verify inputs, names, sidecars, and manifest                             | Portable accepted locally; Installer GUI behavior unclaimed |

## Local packaged Portable acceptance

The packaged Portable archive was accepted on the tested local Windows Server
2025 host. The acceptance covers normal launch, local service start/stop, a
real Codex-shaped event, onboarding completion, demo data, read-only fixed-path
Claude Code and Codex inspection with no automatic config write, the floating
companion, and no raw work content retained or exposed.

Claude Code and Codex setup remains a manual product instruction. This record
covers the Portable path; Installer-specific GUI behavior is unclaimed, while
CI artifact checks are recorded separately. `release-policy.json` remains
`candidate`, and Windows remains an unsigned target.

## Safe manual checklist

1. Launch the Portable package and start and stop the local service.
2. If integration is needed, the product instruction is to copy and manually
   merge only the fixed Claude Code or Codex user-level hook definition. This
   is not acceptance evidence; the acceptance record performs read-only
   fixed-path inspection with no automatic config write.
3. Review Codex definitions in `/hooks`, then run a real Codex-shaped event.
4. Complete onboarding and run the deterministic demo.
5. Show the floating companion and verify that no raw work content is retained
   or exposed.
