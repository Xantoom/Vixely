# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Vixely edits images, video, GIFs, audio and subtitles **entirely in the
browser**. No byte of media leaves the user's machine. There is no backend, no
database, and no runtime JavaScript in production — the container serves static
files with Caddy.

`PLAN.md` at the root and `docs/plan/` are the authority on architecture,
decisions and phasing. Read them before assuming anything about the structure.

## Commands

```bash
bun install              # never npm/yarn/pnpm — Bun 1.4.0 is the only runtime
bun run dev              # Vite dev server
bun run ci               # what CI runs: checks + build + bundle budget
bun run checks           # typecheck, lint, format and unit tests in parallel
bun run typecheck        # tsc --noEmit (TypeScript 7)
bun run lint             # oxlint, zero warnings tolerated
bun run format:write     # oxfmt — tabs and double quotes, not configurable
bun run test:unit        # tier 1: pure logic, no browser, under 5 s
bun run test:browser     # tiers 2 and 3: Chromium + Firefox, minutes
bun run build            # static output in dist/client
bun scripts/generate-tokens.ts   # regenerate src/styles/tokens.css
```

Node is not part of the chain anywhere. If a command needs Node, it is wrong.

## Non-negotiables

These are refusal criteria for a change, not preferences:

- **No server-side media processing.** Client-side is the product, not a
  constraint.
- **No database, no telemetry, no analytics, no third-party script.** The CSP
  enforces it structurally.
- **No FFmpeg or ffmpeg.wasm.** Mediabunny plus WebCodecs covers the need.
- **No visible native HTML control.** No `<video controls>`, no bare
  `<input type=range>`, no unstyled `<select>` or scrollbar.
- **No runtime SSR.** The build emits static files and nothing else.
- **No dependency that fits in under 200 lines of our own code.**

## Layer rules — enforced by lint, not by discipline

```
routes/ → editors/ → { ui/, core/ }
```

1. `core/` never imports React, Zustand or TanStack. It must run unchanged in a
   worker or under Bun with no DOM.
2. `ui/` never imports `core/` or `editors/`. A `Slider` does not know what a
   codec is.
3. `editors/` is the only layer allowed to know both.
4. Only `core/media` imports `mediabunny`.
5. `core/container` is reachable only through its `ContainerBackend` interface —
   it is designed to be deleted the day Mediabunny reads subtitle tracks.

Violations fail `bun run lint`. Do not relax the rule to make a change fit.

## The five invariants

- **I1 — one render graph.** Preview and export traverse the *same* graph, fed
  by the same source; only the destination differs. Never apply a filter in CSS
  on top of a WebGL pass: that is the exact bug the previous iteration shipped.
  Compare mode splits two states of one pipeline, not a render against a raw
  file.
- **I2 — one command bus.** Every document change goes through
  `core/history`. Continuous gestures collapse via `mergeKey`.
- **I3 — one media core.** `core/media` is the sole Mediabunny surface.
- **I4 — explicit lifetimes.** Every `VideoFrame` and `AudioData` has one owner
  that calls `.close()`.
- **I5 — decode and encode in workers.** Only the on-screen WebGL render stays
  on the main thread.

## Conventions

- Documents are plain JSON values: no class, no closure, no `Map`, no `Blob`.
  Every change produces a new document. `tests/unit/document.test.ts` enforces it.
- User-facing strings are **always English in the source**, keyed through
  `src/i18n`. Keys are typed: a missing key or a missing interpolation variable
  is a typecheck error. Adding a key means adding it to all seven locales.
- Colours come from semantic tokens (`--bg`, `--text`, `--accent`), never from a
  Catppuccin name. `src/styles/tokens.css` is **generated** — edit
  `src/ui/theme/` and rerun the script.
- Catppuccin Latte is not WCAG AA conformant as shipped; accents are
  contrast-corrected at token generation and a unit test fails the CI on any
  regression.
- Comments explain *why*, and are sparse. The code says what it does.
- File names are kebab-case; the lint enforces it.

## Testing

Three tiers, because WebCodecs, WebGL and Web Audio exist in **no** simulated
DOM:

1. `tests/unit/` — pure logic under Bun, no DOM. Push as much here as possible.
2. `tests/browser/` — components in a real browser.
3. `tests/browser/` (media) — decoding, encoding, the pixel comparison that
   proves I1.

Never add jsdom or happy-dom to work around tier 1's limits: move the logic into
`core/` instead.

## Things that will waste your time if you do not know them

- The router export must be named `getRouter`. Anything else fails cryptically.
- `tsconfig.json` needs `"types": ["vite/client"]` or the first
  `import "./app.css"` fails with TS2882.
- oxfmt 0.64 takes no style options: tabs and double quotes are imposed. Do not
  fight it, run `bun run format:write`.
- oxfmt reformats Markdown too; `.oxfmtrc.json` excludes `**/*.md` for that
  reason.
- The SPA shell is built from `src/routes/app.tsx` and lands as
  `dist/client/_shell.html`. `/` is a genuinely prerendered page — do not let the
  shell overwrite it, or the SEO that D1 exists for is gone.
- Mediabunny reads **no** subtitle track and writes only WebVTT. Everything
  subtitle-related is ours (`core/container`, `core/subtitles`).
- Encoding is configured through `quality`, never through the deprecated bitrate
  fields.
