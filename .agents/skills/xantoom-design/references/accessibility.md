# Accessibility: WCAG 2.2 AA, every time

The target is WCAG 2.2 AA. It covers EN 301 549 (which references WCAG 2.1 AA) and so the European Accessibility
Act. Automated checks (axe) find only about half the problems, so also go through this list by hand: keyboard only,
a screen reader, 200 % zoom, forced colours and reduced motion.

## Structure

- Set `<html lang>`, and `lang` on any passage in another language. Give each page a `<title>` saying where the user is.
- Use landmarks (`header`, `nav`, `main`, `footer`), one `h1`, headings in order, and `x-skip-link` first.
- Use lists for lists and tables for data (`th`, `scope`, `caption`). Never use a table for layout.
- Keep brand names, code and identifiers out of machine translation with `translate="no"`.

## Names, roles, states

- Prefer native elements to ARIA. Navigation is `<a href>`; an action is `<button type="button">`.
- Every control has a visible `<label>` (or, for an icon button, an `aria-label` that matches its tooltip). Write
  placeholders as examples that end with `…`, never as the label.
- Give decorative SVGs `aria-hidden="true"`. A meaningful image gets an `alt` that says what it shows.
- Status is never colour alone: add text or an icon (`x-badge` with a word, `x-error` with its icon, a selected tab
  with its underline).
- Use `aria-current="page"` on the current link, and `aria-busy="true"` on a button while it works.
- Announce async results politely (`toast()` uses `ariaNotify()` with a live-region fallback). Errors sit next to
  their field, linked with `aria-describedby`.

## Keyboard and focus

- Everything works with the keyboard, in reading order, and follows the WAI-ARIA patterns. `enhance()` gives tabs and
  `role="menu"` menus their arrow keys.
- Focus is always visible: `outline: var(--x-ring)`, `:focus-visible`, never `outline: none` without a replacement.
  Sticky bars must not cover the focused element (`scroll-margin` and `scroll-padding`).
- Dialogs: the browser moves, traps and returns focus. Do not add your own.
- Never move focus on hover or focus alone, and never open anything on focus that hides what has focus.

## Targets and input

- Targets are at least 24 × 24 px, and 44 px on touch screens. Components already do this (`--x-control`, the
  `x-check` label). The label and the control share one hit area, with no dead zones.
- Fields are 16 px or larger on touch screens (iOS zoom), allow paste, and use the right `type`, `inputmode`,
  `autocomplete` and `enterkeyhint`. Turn off spell checking for emails, codes and usernames.
- Do not disable submit to block validation. Disable it only while the request runs.
- Every drag or swipe also works with a click and with the keyboard.

## Contrast

- Text reaches 4.5:1, and large text 3:1. The edges and states of controls reach 3:1. The tests enforce this for
  every token pair: use the pairs as documented (`--x-on-fill` on `--x-fill`, `--x-accent` on surfaces).
- When you place text on an image or a custom colour, measure it.
- Forced colours: the components keep their borders, underlines and outlines. Do not convey anything with a
  background or a `box-shadow` alone.

## Content and time

- Text reflows at 320 px wide and at 200 % zoom, and survives the 1.4.12 text-spacing overrides (no fixed heights on text).
- Never disable zoom.
- Motion that starts by itself and lasts more than 5 s has a pause control. Nothing flashes more than three times a
  second.
- Persistent toasts are the default. A timed one pauses on hover and focus, and its content is available elsewhere.
- Confirm destructive actions, or offer an undo.
