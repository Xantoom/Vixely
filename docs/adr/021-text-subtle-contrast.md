# 021 — `--text-subtle` clears AA, not the non-text threshold

**Status:** accepted, 2026-08-20. Amends [018](018-token-contrast-correction.md).

## Context

The token was derived against the 3:1 non-text threshold on the grounds that it
carries disabled text, which WCAG SC 1.4.3 exempts. Running axe against the
built pages showed that assumption was wrong: the token is used for timecodes,
file sizes, format badges and hints — real content, on twenty-four nodes of the
home page alone, at 4.06:1.

The unit suite did not catch it because it tests the contract as declared, and
the contract declared the wrong usage.

## Decision

`--text-subtle` is derived against AA (4.5:1) like the other text tokens. Text
that is genuinely disabled is dimmed with opacity on top, which is the case the
exemption actually covers.

## Consequences

- The token darkens slightly in the light theme; the visual hierarchy between
  `--text`, `--text-muted` and `--text-subtle` is preserved but compressed.
- The unit test now asserts AA for it, so the classification cannot silently
  revert.
- More generally: a contrast contract is an assertion about usage, and axe
  against real pages is what checks the assertion. Both are kept.
