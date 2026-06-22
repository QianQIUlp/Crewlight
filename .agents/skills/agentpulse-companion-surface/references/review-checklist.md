# Companion Surface Review Checklist

Use this checklist in review mode or as the final pass after an authorized
implementation. Apply the Microsoft frontend-design-review source only as a
review framework; do not use its creation mode to redefine Crewlight.

## Product and Scope

- Does the surface prioritize multiple current agent sessions?
- Can the user identify action-needed work within a quick scan?
- Does the result remain a compact local companion rather than a generic
  dashboard, chat client, terminal, or pet platform?
- Does the change avoid unrequested architecture, dependencies, services, and
  configuration mutation?

## Information Hierarchy

- Are action states strongest, errors clear, passive work secondary, and
  completed work quiet?
- Are agent identity, workspace, normalized status, and recency easy to find?
- Is `unknown` visibly neutral and low-confidence?
- Does compact mode stay dense without becoming ambiguous?
- Does focus mode add useful detail without duplicating the entire overview?

## Interaction and Accessibility

- Are all interactive elements reachable and operable by keyboard?
- Are semantic controls used instead of clickable generic containers?
- Are focus indicators visible in normal and forced-colors modes?
- Do status cues remain understandable without color and without motion?
- Does reduced motion remove non-essential movement?
- Does the layout tolerate narrow widths, long safe labels, and text zoom?

## Motion and Polish

- Does every animation communicate a real attention or status distinction?
- Are recurring effects subtle and limited?
- Do terminal states acknowledge once and then settle?
- Are `transform` and `opacity` favored over layout animation?
- Are spacing, typography, borders, and interaction feedback consistent?
- Has decorative styling reduced scan speed or obscured hierarchy?

## Privacy and Runtime Safety

- Does the UI render only normalized or explicitly derived allowlisted fields?
- Are prompts, transcripts, tool data, command bodies, raw events, and secrets
  absent?
- Are dynamic values inserted with DOM APIs and `textContent`?
- Do loopback, CSP, `no-store`, polling, and read-only behavior remain intact?
- Does the design avoid implying persistence, streaming, process monitoring,
  or desktop lifecycle behavior that does not exist?

## Review Output

Order findings by severity:

1. Product-boundary, privacy, accessibility, or behavior regressions.
2. Misleading status or attention representation.
3. Interaction, responsive, and visual consistency problems.
4. Optional polish.

For each required finding, identify the location, observed problem, impact, and
smallest corrective action. State explicitly when no required findings remain.
