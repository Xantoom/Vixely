# 018 — Accent colours are contrast-corrected at token generation

**Status:** accepted, 2026-08-20. Refines the design system's colour section.

## Context

The design system fixes Catppuccin Latte and Macchiato as the palettes, and
requires WCAG 2.2 AA on every text/background pair, AAA for body copy. Measuring
the raw palettes shows Latte does not meet that bar: `peach` on `base` is 2.6:1,
`yellow` 2.3:1, `teal` 3.3:1, and `subtext0` as secondary text is 4.37:1 — all
below the 4.5:1 threshold. Macchiato passes comfortably.

Three options were on the table: pick off-palette colours by hand, drop the AA
requirement for accents, or derive compliant variants from the palette.

## Decision

Accents, status colours and text tokens are pushed the **minimum distance**
towards black or white that clears their threshold against every surface they
can appear on. The derivation is a deterministic binary search
(`ensureContrast`), runs once at token generation, and its output is the
committed `src/styles/tokens.css`.

Two further consequences fall out of the same measurement:

- The light theme maps `--bg` to `mantle` and `--bg-raised` to `base`, rather
  than walking the surface ramp downwards. In Latte a raised surface must be
  *lighter* than the app background, or text contrast degrades as elevation
  rises.
- Every accent gets four tokens: `--accent-*` for text and icons, `-solid` for
  filled controls, `-on` for what sits on the filled control, and `-surface` for
  tinted banners. They have different contrast requirements and cannot be one
  value.

## Consequences

- The palettes stay recognisably Catppuccin; hue is preserved, only lightness
  moves.
- `src/styles/tokens.css` is generated. Editing it by hand is a mistake, and a
  unit test compares the committed file to the derivation.
- `tests/unit/contrast.test.ts` walks every declared pair in both themes and
  fails the CI on any regression. It also records the raw-palette failures, so
  removing the correction cannot pass silently.
