# Motion

Motion explains cause and effect: what opened, where it came from, what changed. It is never decoration for its own
sake.

## Rules

- Animate `opacity`, `translate`, `scale` and `rotate` only: they stay on the compositor. Never `transition: all`; list
  the properties. The one layout animation allowed is the accordion's `block-size` (with `interpolate-size`).
- Timing: `--x-duration-fast` (160 ms) for hovers, presses and small controls, `--x-duration-base` (240 ms) for
  panels and dialogs, and `--x-duration-slow` (420 ms) for page-level changes. Easing is `--x-ease-out`
  (`cubic-bezier(0.16, 1, 0.3, 1)`), the signature settle. Use `--x-ease-in-out` for loops.
- Spatial motion (translate, scale, rotate) is opt-in: write it inside `@media (prefers-reduced-motion:
  no-preference)`, next to the static rule. Under `reduce`, keep the fades (shortened to about 100 ms) and slow the
  loaders down rather than stopping them. Never use a global `animation-duration: 0.01ms`.
- Always keep the final state: an element whose animation does not run must still end visible.
- Animations can be interrupted, start from where things physically are (`transform-origin`), and never flash more
  than three times a second. Motion that starts by itself and lasts more than 5 s has a pause control.

## What the design system already moves

| Where | Motion |
| --- | --- |
| Buttons, `x-pressable` | Tint on hover, `scale: 0.97` on press |
| Checkbox, radio, switch | The mark scales in; the thumb slides (and flips direction in RTL) |
| Dialog | Fades and rises by 0.75 rem from 0.97 scale; a bottom sheet on phones, a side sheet with `data-variant="sheet"` |
| Popover, menu, select picker | Fade with a slight scale from the anchor side |
| Tooltip | Fade, after a 0.45 s delay (neighbours open at once) |
| Toast | Rises in, sinks out (`data-closing`) |
| Accordion | Height and chevron |
| `x-reveal` | Rises in as it scrolls into view (scroll-driven, no script) |
| `x-enter` | Content coming in (a page, a panel): rises by 0.5 rem and fades; only fades under reduced motion |
| `x-stagger` | On a list or grid: its items enter one after the other, 28 ms apart, capped at 12 beats (`sibling-index()`, or `--x-index` where it is missing) |
| Tabs | Edge fades follow the scroll position |
| Spinner, indeterminate progress, skeleton | Loops (slower, or a static skeleton, under reduced motion) |

Entry transitions use `@starting-style`. Exits from the top layer use `transition-behavior: allow-discrete` with
`display` and `overlay` (Chromium). Elsewhere `closeTopLayer()` and `enhance()` play the exit through `data-closing`.

## View transitions

Same-document view transitions take the Xantoom timing automatically. A multi-page site opts in to cross-document ones
with `@view-transition { navigation: auto; }` in its own CSS. Name only the elements that really travel
(`view-transition-name`), and keep the default cross-fade for the rest.

## Brand motion (videos, social posts)

Make them with HyperFrames (HTML compositions rendered to video, Apache 2.0) using these same tokens: the brand
gradient, Inter, `--x-ease-out`, and short durations. Export H.264 MP4 with a still poster. On the web, use
`<video autoplay muted loop playsinline>`, gated on `prefers-reduced-motion` with a pause control.
