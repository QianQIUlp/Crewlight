# Upstream Sources

These sources informed local rules. The AgentPulse skill is an independently
written workflow constrained by this repository. Do not install or execute the
upstream skills, and do not copy their scripts, assets, themes, mascots,
animation packs, or product language.

## Anthropic Frontend Design

- Source:
  <https://github.com/anthropics/skills/blob/2235be7c60b551f5de82ade908fd3816455afcda/skills/frontend-design/SKILL.md>
- License: Apache-2.0.
- Adapt: intentional visual direction, coherent hierarchy, restrained
  differentiation, and avoidance of generic template aesthetics.
- Reject: broad aesthetic effects that reduce compact scanability or conflict
  with the current stack and security boundary.

## Microsoft Frontend Design Review

- Source:
  <https://github.com/microsoft/skills/blob/cbfd1b6652debe08f9d329d713b382a1a0db2e3e/.github/skills/frontend-design-review/SKILL.md>
- License: MIT.
- Adapt only in review mode: frictionless task completion, quality craft,
  trust, accessibility, consistency, and actionable review findings.
- Reject: its interface creation mode and assumptions about Figma, Storybook,
  component libraries, or a separate design system.

## Tiny CSS and Frontend A11y

- Sources:
  - <https://github.com/mikemai2awesome/agent-skills/blob/f092efdf6faf8d575b76ac6a9bd5d618434845c3/skills/tiny-css/SKILL.md>
  - <https://github.com/mikemai2awesome/agent-skills/blob/f092efdf6faf8d575b76ac6a9bd5d618434845c3/skills/frontend-a11y/SKILL.md>
- License: MIT.
- Adapt: native browser behavior, semantic HTML, minimal CSS, logical
  properties, visible focus, forced colors, contrast, and reduced motion.
- Reject: generic defaults when they conflict with AgentPulse's established
  visual hierarchy or current implementation.

## Motion Framer

- Source:
  <https://github.com/freshtechbro/claudedesignskills/blob/8530774addb93ae23e3155fa320736fc68304090/.claude/skills/motion-framer/SKILL.md>
- License: MIT.
- Adapt: state-based motion, transform/opacity preference, low-cost
  micro-interactions, and reduced-motion handling.
- Reject: React, Framer Motion, generators, dependencies, and framework-specific
  implementation.

## Qwen Code Desktop Pet

- Source:
  <https://github.com/QwenLM/qwen-code/blob/24d7595ffd4a5dbb7effb4fd3b887a305f8ddf28/.qwen/skills/desktop-pet/SKILL.md>
- License: Apache-2.0.
- Adapt only: the idea of mapping a bounded set of runtime states to distinct
  animation intents.
- Reject: character research, palette generation, spritesheet generation,
  pet manifests, bundled scripts, Qwen-specific state names, and every write
  to `~/.qwen`.

## OpenPets

- Source:
  <https://github.com/alvinunreal/openpets/tree/ff7eadfffd6953dafb5f0c002e0cedd5f2c07b61>
- License: MIT.
- Adapt as product reference: local companion boundaries, explicit permissions,
  diagnostics, and avoiding sensitive agent content in companion output.
- Reject: implementation copying, plugin-platform scope, pet marketplace
  behavior, and new integration architecture.

## Clawd on Desk

- Source:
  <https://github.com/rullerzhou-afk/clawd-on-desk/tree/7c462ee297b5575301924cca6c2452912251c804>
- License: AGPL-3.0-only.
- Use only as a competitive boundary: validate that AgentPulse remains
  multi-agent-first and avoid unsupported comparison claims.
- Reject: all code, assets, themes, mascots, animation packs, UX language, and
  pet-first product framing.
