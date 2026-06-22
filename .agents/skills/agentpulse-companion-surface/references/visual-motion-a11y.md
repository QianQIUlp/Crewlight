# Visual, Motion, and Accessibility Rules

## Visual Direction

Make the surface read as a compact local command strip for concurrent agents.
Use controlled density, strong hierarchy, and one coherent visual language.

- Make actionable sessions visually dominant.
- Keep passive work readable without competing for attention.
- Quiet completed work.
- Show agent, workspace, status, and recency before secondary detail.
- Avoid interchangeable SaaS cards, decorative gradients, excessive glass,
  oversized headings, and layout chrome that reduces scan speed.
- Use existing CSS custom properties or introduce a small local token set when
  repeated values justify it.
- Match implementation complexity to the restrained surface.

## Native Web Baseline

Prefer native HTML, CSS, and JavaScript.

- Use semantic elements and native controls before ARIA or custom interaction.
- Use logical CSS properties when practical.
- Keep visible `:focus-visible` indicators with sufficient contrast.
- Preserve keyboard access for every clickable or selectable row.
- Keep content usable at narrow widths and with text zoom.
- Support forced-colors mode; do not remove system focus or borders without a
  visible replacement.
- Do not reset browser behavior without a concrete need.

## State-to-Motion Taxonomy

Use motion as a secondary status cue, never as decoration or the only cue.

| State                | Motion intent                                                  |
| -------------------- | -------------------------------------------------------------- |
| `running`            | Very subtle periodic activity cue                              |
| `using_tool`         | Low-intensity working cue distinct from ordinary running       |
| `waiting_input`      | Noticeable, calm request for attention                         |
| `waiting_permission` | Noticeable, calm permission cue                                |
| `failed`             | One brief error acknowledgement, then remain still             |
| `rate_limited`       | One brief constrained/error acknowledgement, then remain still |
| `completed`          | Brief positive acknowledgement, then become quiet              |
| `idle`               | Still or nearly still                                          |
| `unknown`            | Neutral and still; do not imply confidence                     |

This taxonomy is adapted for normalized Crewlight statuses. Do not import pet
poses, spritesheets, generated characters, or upstream animation assets.

## Motion Implementation

- Animate `transform` and `opacity` where possible.
- Avoid animating layout properties such as `left`, `top`, `width`, or
  `height` for recurring effects.
- Keep recurring motion low amplitude and limited to the smallest meaningful
  element.
- Avoid simultaneous animation across the entire session list.
- Do not flash more than three times per second.
- Avoid motion that blocks reading, changes ordering, or suggests a status
  transition not present in normalized data.

Place non-essential animation inside:

```css
@media (prefers-reduced-motion: no-preference) {
  /* optional state motion */
}
```

Under reduced motion, retain text, shape, icon, border, and ordering cues. Do
not replace motion with another continuous effect.

## Color and Feedback

- Pair status color with text and at least one additional visible cue.
- Meet WCAG AA contrast for normal text and provide at least 3:1 contrast for
  controls, focus indicators, and meaningful graphical boundaries.
- Do not use success styling for `unknown`.
- Keep error and action treatments distinguishable without relying on hue.
- Provide immediate visual feedback for hover, focus, and activation without
  moving content unexpectedly.
