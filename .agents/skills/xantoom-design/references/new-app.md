# A new app or site

Each app keeps the signature (ground, type, shapes, motion, focus, components) and changes only its theme: a
gradient, an accent, and two knobs. That is how it is recognisably itself and recognisably Xantoom. There are at most
32 projects.

## 1. Reserve a hue

Pick a gradient whose hue is at least 25° from every other one in the registry, or a neutral one (graphite, ink).
When hues run out, vary the shape of the gradient (two or three stops, dark to light, or pastel), not only its hue.
Add the app to the registry below in the same change.

| App | What it is | Gradient (logo = fill unless noted) | Hue | Accent light / dark | Radius | Density |
| --- | --- | --- | --- | --- | --- | --- |
| xantoom.dev | Portfolio | `#ff5a2c → #ff7a21 → #ffae1a` | 20–40° | `#c23a12` / `#ff8a5c` | 1 | 1 |
| Vixion | Screen monitor (Vix + vision) | `#ffd36e → #ffa574 → #ff94bf` (pastel) | 40° → 330° | `#a8461c` / `#ffb08f` | 1.2 | 1 |
| Vexode | Worldbuilding codex (V, X, codex) | `#0b2a4a → #0f6478 → #1aa38f`; fill ends `#12806f` | 210° → 170° | `#0f6478` / `#4fd1bc` | 1.1 | 1 |
| Vixely | Media and subtitle editor (Vix + pixel) | `#2f6bff → #5a4dff → #9b4dff`; fill `#2b62f0 → … → #8a45f5` | 225–270° | `#3d4fe6` / `#a3a9ff` | 0.8 | 0.9 |
| Vixeeny | Screen capture (Vix + screen) | `#43464f → #1c1d23` graphite; dark fill `#f4f4f6 → #c4c6cd` | neutral | `#2e3038` / `#d4d5db` | 0.9 | 0.95 |

Free hue ranges: 50–160° (yellow-green to green) and 280–320° (purple to magenta). Use them in that order, and
split them as projects arrive.

## 2. Write the theme

Copy `tokens/themes/vexode.tokens.json` to `tokens/themes/<app>.tokens.json` and set:

- `brand.1..3`: the logo gradient, which may be as vivid as you like (it is decorative).
- `fill.1..3`: the same gradient adjusted so that `on-fill` reaches 4.5:1 on all three stops, in both modes. Give a
  stop a dark value (the `app.xantoom.dark` extension) if the light one disappears on the dark ground.
- `on-fill`: dark ink on light gradients, white on dark ones.
- `accent`: a light-mode and a dark-mode colour, each reaching 4.5:1 on `bg`, `surface` and `raised`.
- `shape.radius` (0.8 to 1.2) and `shape.density` (0.9 to 1): sharper and denser for pro tools, softer for
  consumer apps.

Run `bun run check`. The contrast tests list every pair that fails. Then look at the demo with the new theme in light,
dark, RTL and on a phone.

## 3. Draw the logo

All logos share one grammar, so they read as a family:

- **The tile:** a 30 × 30 square with rx 7.5 (25 %) at (1, 1), in a 32-unit viewBox, filled with the brand gradient
  (115°, or vertical for neutral themes). Use one drawing for both themes: no light and dark variants.
- **The V:** Vixion's letter, unchanged, centred:
  `polygon 10.2,10.6 13.5,10.6 16,17.05 18.5,10.6 21.8,10.6 17.6,21.4 14.4,21.4`, in white (or dark ink on light
  gradients).
- **One element** around the V that evokes what the app does, drawn with 1.7 to 1.8 strokes, simple, and never glued
  to the V:
  - Vixion: a ring with a red live dot (`#e5322d`).
  - Vixely: a transform box with four square handles.
  - Vexode: a compass ring with a gold north diamond (`#ffc861`).
  - Vixeeny: the four corners of a capture zone.
- **Test it** at 16, 32 and 48 px, on light and dark grounds, and in one colour. Under 32 px, drop the element and
  enlarge the V if the element turns to mush. Ask what it evokes to someone who does not know the app.
- **Files:** `favicon.svg` (the tile), `apple-touch-icon.png` (180 px, full bleed), `icon-192.png`, `icon-512.png`,
  and `maskable-512.png` (full bleed, with the mark scaled to 74 % to stay inside the safe zone). Render SVG to PNG
  with `@resvg/resvg-js`. Never generate images with AI.

## 4. Wire it

In the app: `bun add github:Xantoom/xantoom-design#vX.Y.Z`, `bunx xantoom-design sync`, add
`"postinstall": "xantoom-design sync"`, then import `xantoom-design/css` and `xantoom-design/themes/<app>.css`. Set
`<meta name="theme-color">` to `--x-bg` in each mode (`media="(prefers-color-scheme: dark)"`).
