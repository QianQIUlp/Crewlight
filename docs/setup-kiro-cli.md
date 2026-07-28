# Kiro CLI Integration Guide (Experimental)

Crewlight observes Kiro CLI through its documented custom-agent hooks and keeps only allowlisted status, identity, location, and short descriptive fields.

## Setup

Print a mergeable JSON fragment:

```bash
crewlight setup kiro-cli --print
```

Merge the generated `hooks` object into the Kiro custom-agent JSON file you actually use. Project agents live under `.kiro/agents/`; global agents live under `~/.kiro/agents/`. Preserve the rest of the agent definition and any existing hooks.

The fragment uses Kiro CLI's documented event names and direct command entries:

- `agentSpawn`
- `userPromptSubmit`
- `preToolUse`
- `postToolUse`
- `stop`

## Verify

1. Start `crewlight daemon --notifier console`.
2. Run the printed adapter smoke test. This checks only Crewlight's ingest path.
3. Activate the edited Kiro agent, inspect `/hooks`, invoke a tool, and complete a turn. Confirm those real events appear in Crewlight.

The smoke test does not prove that Kiro loaded the custom-agent hooks.
