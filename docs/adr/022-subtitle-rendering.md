# 022 — Subtitles are rendered in-house; jassub is deferred

**Status:** accepted, 2026-08-20. **Supersedes ADR 011** in part: the pass
enters the render graph as a texture exactly as 011 requires, but the texture
is produced by our own renderer rather than by jassub.

## Context

ADR 011 named jassub as the ASS renderer, and the reason it gave — that an
overlay in CSS would recreate the double render path — is about *where* the
result enters the pipeline, not about who draws it. That part stands and is
implemented: `renderCues` draws into an offscreen canvas which the graph
composites through the `[subs]` pass, identically in preview and in burn-in.

What changed is the cost/benefit of the renderer itself. jassub is roughly two
megabytes of WASM plus its fonts. A user opening an SRT track, or an ASS track
that is plain dialogue with a font and a colour, gets no benefit from it — and
the anti-goal about dependencies exists for exactly this shape of trade.

## Decision

The built-in renderer covers what a canvas can do faithfully: per-style font,
size, weight, italics, fill and outline colours, alignment, margins, layer
ordering, and line breaks. Tags it cannot honour are stripped rather than
approximated, because a subtitle showing `{\pos(960,120)}` on screen is worse
than one that is merely positioned by its style.

jassub is not removed from the plan — it is deferred until the editor offers
what needs it, and loaded lazily when it arrives:

- transforms and rotation (`\frx`, `\fry`, `\frz`, `\t`)
- karaoke timing (`\k`, `\kf`, `\ko`)
- vector drawings (`\p`)
- per-cue absolute positioning and movement (`\pos`, `\move`, `\clip`)

## Consequences

- A track using those features previews with its styling but without them.
  This is a visible limitation and the interface should say so; today it does
  not, which is a gap rather than a decision.
- PGS preview rendering exists as `renderPgsBitmap` and is **not wired up**:
  display sets decode and their timings are editable, but the images are not
  yet composited into the preview, and burn-in refuses a PGS track rather
  than silently dropping it.
- The day jassub is added, it replaces the body of `renderCues` and nothing
  else moves: the graph already takes a canvas, which is what ADR 011 was
  protecting.
