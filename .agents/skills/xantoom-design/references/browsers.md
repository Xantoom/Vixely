# Browser support policy

Core experiences must work for about 90 % of users. Chromium browsers are the majority. A feature that is missing in a
browser with about 5 % share is acceptable when its absence leaves the page usable, only less polished.

Measured in November 2026 (caniuse and web-features, global usage):

| Use freely (about 85 % or more) | Coverage |
| --- | --- |
| `<dialog>`, `showModal()`, `::backdrop` | 92 % |
| Container queries, logical properties, nesting, `:has()`, `@layer` | 92 % |
| Popover API (`popover`, `popovertarget`) | 89 % |
| `light-dark()`, `color-mix()` | 89 % |
| `@starting-style`, `transition-behavior` | 89 % |
| Same-document view transitions | 89 % |
| Scroll-driven animations (Baseline since October 2026) | 85 % |
| `field-sizing: content` | 85 % |
| Invoker commands (`command` / `commandfor`); `enhance()` fills them in elsewhere | 84 % |

| Progressive enhancement only (the fallback must be fine) | Coverage | Fallback |
| --- | --- | --- |
| `@scope` | 82 % | Do not depend on it |
| Anchor positioning (`position-area`) | about 85 %, partial | Popover is centred by the browser (rules gated with `@supports`) |
| Customizable `<select>` (`appearance: base-select`) | 73 % | The native picker |
| `interpolate-size` / `::details-content` | 71 % | The accordion opens without animating |
| `if()` | 70 % | Do not use it in the design system yet |
| `interestfor`, `popover="hint"` | 67 % | No hover tooltip; the trigger keeps its accessible name |
| `overlay` (top-layer exits) | Chromium | `closeTopLayer()` plays the exit through `data-closing` |
| `ariaNotify()` | Baseline 2026 | Live region (built into `toast()`) |
| `focusgroup` | Chromium | Arrow keys from `enhance()` |
| `closedby` | Chromium, Firefox | Click-outside handling from `enhance()` |
| `text-autospace`, `word-break: auto-phrase` | Chromium | Default CJK spacing |

## Rules

- Do not load a polyfill unless a feature in the first table needs one for a core flow. If one is added, load it
  only when the feature is missing (`if (!('x' in Y.prototype)) import(…)`), and note it here.
- Gate layout changes that rely on an enhancement with `@supports`, so unsupported browsers keep the default
  behaviour (see the anchor-positioning rules in `overlays.css`).
- Combine a fallback and a modern selector with `:is()` or `:where()`, never by duplicating rules.
- Re-measure coverage once a year, and before adopting a new feature, from the `caniuse-lite` and `web-features` packages.
