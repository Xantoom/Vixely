---
name: xantoom-design
description: The Xantoom design system, shared by every Xantoom web app (Vixion, Vixely, Vexode, Vixeeny, xantoom.dev and later ones). Use it for any UI work in such a project, including pages, components, styles, themes, motion, logos and icons, accessibility, responsive layout and translations, and whenever a new app or site needs its own variant.
license: MIT
metadata:
  author: Xantoom
  version: 0.4.2
---

# Xantoom design system

Every Xantoom interface shares one signature and takes one theme. A user who knows one app should recognise the
next from its ground, type, shapes, motion and gradient fill, while its colour and a few knobs tell it apart.

The package is `xantoom-design` (github.com/Xantoom/xantoom-design). It ships pure CSS (`dist/xantoom.css`, about
7 KB brotli), one theme file per app (`dist/themes/<app>.css`), DTCG tokens (`tokens/`) and an optional script
(`dist/xantoom.js`, about 3 KB) for what CSS cannot do alone.

## Before you write UI

1. Use a component that already exists (see [references/components.md](references/components.md)). Write new CSS
   only for what no component covers, with the tokens and no raw values.
2. Use native HTML first: `<button>`, `<a href>`, `<dialog>`, `popover`, `<details>`, `<select>`, `<input>`. The
   components style these elements; they do not replace them.
3. Keep the rules below. Each reference holds the details and the reasons.

## Rules

- **Tokens only.** Colours, spaces, radii, durations and shadows come from `--x-*` custom properties
  ([references/tokens.md](references/tokens.md)). Never write a hex value, `rgb()` or a pixel spacing in app code.
- **The accent has three roles.** `--x-fill` (gradient, with `--x-on-fill` text) fills primary buttons and checked
  controls. `--x-accent` colours text, links, focus rings and thin marks. `--x-brand` is the logo gradient, which is
  decorative only and never sits under text. Do not swap them: only those pairs are contrast-tested.
- **Layers.** The design system lives in `@layer x`. Declare `@layer x, app;` and put the app's CSS in `app` (or
  leave it unlayered): it always wins without `!important`.
- **Accessibility is WCAG 2.2 AA, always** ([references/accessibility.md](references/accessibility.md)). Visible
  focus, 24 px targets (44 px on touch), colour never alone, labels on every control, names on icon buttons.
- **Motion** ([references/motion.md](references/motion.md)). Animate only `opacity` and transforms, opt in to spatial
  motion with `prefers-reduced-motion: no-preference`, and use the Xantoom ease and durations.
- **Every language** ([references/i18n.md](references/i18n.md)). Use logical properties, no text in CSS or
  components, RTL and CJK tested, and dates and numbers formatted with `Intl`.
- **Every screen** ([references/responsive.md](references/responsive.md)): 320 px phones to 8K, ultra-wide and
  square. Layouts adapt to their container, not to device names.
- **Browsers** ([references/browsers.md](references/browsers.md)). Core features reach about 90 % of users, and
  enhancements must degrade gracefully. No polyfill without a reason recorded in that file.
- **Icons over words** when the meaning is clear, always with an accessible name. Use `cursor: pointer` on
  everything clickable (the reset does it for native controls).
- **Performance first.** No `transition: all`, no animated layout properties (accordion height is the one
  exception), `content-visibility` for long lists, and no blur filters on large surfaces.
- **Native first.** Build on the platform (`<dialog>`, `popover`, `<select>`, `interestfor`, radios) and this design
  system's classes. Add an interface library (React Aria and the like) only where the platform still lacks the
  behaviour (accessible drag and drop, a combobox, a styled select in Firefox), and say why in a comment.
- **Reorganise, do not stack.** When room runs out, a component changes its layout instead of wrapping: secondary
  settings fold behind one button, the main action becomes an icon, the search takes the width. Key it to its
  container (`@container`), so it also holds in a narrow panel on a wide screen. No wasted space at any width.
- **Favicons served right.** Link the icon with a content hash (`/favicon.svg?v=<8 hex of its SHA-256>`) and serve it
  with its type (`image/svg+xml`): without the type the browser ignores it and keeps another app's icon from the
  same port; without the hash it keeps an old one.
- **Theme contrast.** An app with its own themes runs `bunx xantoom-design contrast <themes.css> --theme <app>` in its
  tests or CI (`--prefix <app>` when it names some colours itself, `--ground <name>` for each ground of its own): text
  pairs reach 4.5:1 and interface colours 3:1 in every theme.

## Adding the design system to a project

```sh
bun add github:Xantoom/xantoom-design#v0.4.2
bunx xantoom-design sync          # copies this skill into .agents/skills/, links .claude/skills/, adds pointers
```

Also add `"postinstall": "xantoom-design sync"` to the project's `package.json`, so the skill stays current on every
install. Commit the synced files: an agent reads them before any install.

```css
@layer x, app;
@import "xantoom-design/css";
@import "xantoom-design/themes/vexode.css";
```

A site that uses only some components imports `xantoom-design/foundation` (tokens, reset, base, motion and
utilities, about 3 KB brotli) plus their families, `xantoom-design/components/<family>.css` (`actions`, `forms`,
`content`, `feedback`, `navigation`, `overlays`; a toast's close button needs `actions`). The skip link is in the
foundation: every page has one.

A React and Tailwind app uses the design system's components through `xantoom-design/react` and its tokens through
`xantoom-design/tailwind.css`: never a second button, menu, field, tooltip or dialog of its own, and never a colour,
radius, shadow or duration outside the tokens (Tailwind's palette is cleared; an app-only colour goes in the app's
own `@theme`, defined from `--x-*` tokens). See [references/components.md](references/components.md#react).

```css
/* Tailwind's preflight under the design system, its utilities over it. */
@layer theme, base, x, components, utilities;
@import 'tailwindcss';
@import 'xantoom-design/foundation';
@import 'xantoom-design/components/overlays.css';   /* and the other families the app's components use */
@import 'xantoom-design/themes/vexode.css';
@import 'xantoom-design/tailwind.css';               /* bg-surface, text-fg-muted, rounded-md, duration-fast… */
```

```tsx
import { Button, Dialog, Menu, MenuItem, TextField, Tooltip } from 'xantoom-design/react';
```

```html
<meta name="color-scheme" content="light dark">
<script type="module">import { enhance } from 'xantoom-design/js'; enhance();</script>
```

Fonts: self-host Inter and JetBrains Mono (both under the OFL, so commercial use is allowed), for example with
`@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`. The stacks fall back to system fonts.

## A new app or site

Follow [references/new-app.md](references/new-app.md): reserve a hue in the registry, write
`tokens/themes/<app>.tokens.json`, run `bun run check` (the contrast tests must pass in both modes), then draw the
logo with the shared grammar.

## Growing the design system

The design system grows with the apps. When work in a project produces something useful beyond that project (a
component, a token, a motion pattern, an accessibility or i18n rule, a browser fix), propose to the user that it be
moved into xantoom-design, with a short description of what would change there. Do it only after they agree. Keep
project-specific UI in the project, written with the tokens.

## Where things are

| Need | File |
| --- | --- |
| Token names and meaning | [references/tokens.md](references/tokens.md) |
| Markup for each component | [references/components.md](references/components.md) |
| Accessibility checklist | [references/accessibility.md](references/accessibility.md) |
| Motion | [references/motion.md](references/motion.md) |
| Languages, RTL, CJK | [references/i18n.md](references/i18n.md) |
| Screen sizes | [references/responsive.md](references/responsive.md) |
| Browser support policy | [references/browsers.md](references/browsers.md) |
| New app: theme, logo, registry | [references/new-app.md](references/new-app.md) |
