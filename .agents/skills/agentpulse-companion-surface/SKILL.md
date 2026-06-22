---
name: crewlight-companion-surface
description: Shape, implement, or review Crewlight companion surfaces, including the compact and focus dashboard views, future explicitly authorized floating surfaces, attention hierarchy, and status motion. Use for Crewlight UI work that must remain multi-agent-first, local, compact, accessible, and privacy-safe. Do not use for platform adapters, daemon APIs, session semantics, notifier behavior, ordinary backend work, or unrelated frontends.
---

# Crewlight Companion Surface

Build an attention surface for concurrent coding-agent sessions, not a generic
dashboard or a pet-first product.

## Start

1. Inspect the current repository state, relevant product documentation, and
   existing dashboard implementation before proposing changes.
2. Read [product-boundary.md](references/product-boundary.md) for every task.
3. Select exactly one mode: shape, implement, or review.
4. Read [visual-motion-a11y.md](references/visual-motion-a11y.md) when the task
   changes or evaluates presentation, interaction, or motion.
5. Read [review-checklist.md](references/review-checklist.md) only in review
   mode or for final self-review after an implementation.
6. Consult [upstream-sources.md](references/upstream-sources.md) when tracing
   the origin or permitted use of an adapted rule.

Treat the local references as authoritative. Do not install, execute, or copy
an upstream skill as part of this workflow.

## Shape Mode

Use shape mode for product direction, information hierarchy, wireframes, and
implementation plans.

- Start from the existing normalized session and attention contracts.
- Design for quick recognition of which sessions need action now.
- Keep compact mode dense and focus mode intentionally expanded.
- State any requested capability that crosses the product boundary.
- Produce the smallest decision-complete artifact requested by the user.

Do not modify files when the request is review, critique, comparison, or
planning only.

## Implement Mode

Use implement mode only when the user requests code or documentation changes.

- Preserve the existing stack and public behavior unless the user explicitly
  authorizes a change.
- Prefer small changes to the current native HTML, CSS, and JavaScript.
- Reuse existing derived dashboard fields instead of exposing new source data.
- Keep rendering safe through DOM construction and `textContent`.
- Add or update focused tests for changed behavior.
- Verify the result in proportion to the change, then run the review checklist.

Do not add Electron, Tauri, React, Vite, Tailwind, animation libraries,
persistence, SSE, WebSocket, background services, external assets, CDN
resources, or configuration mutation unless the user explicitly requests that
specific scope.

## Review Mode

Use review mode for visual QA, accessibility review, or PR review. Apply the
adapted Microsoft frontend-design-review principles only in this mode.

- Review the implementation that exists; do not redesign product strategy.
- Prioritize product-boundary, privacy, accessibility, and behavior regressions
  before aesthetic polish.
- Report actionable findings with file and line references when possible.
- Distinguish required fixes from optional polish.
- Do not modify files unless the user explicitly asks for fixes.

## Completion

Report the completed artifact, verification performed, and any boundary that
remains intentionally deferred. Do not imply that a browser prototype is a
desktop shell or that decorative motion represents platform lifecycle truth.
