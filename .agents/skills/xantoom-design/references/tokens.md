# Tokens

The source of truth is `tokens/*.tokens.json` (DTCG 2025.10). A colour's dark value sits in its
`app.xantoom.dark` extension; the build turns the pair into `light-dark()`. So every colour follows
`color-scheme`: the system preference by default, or `data-theme="light|dark"` on `<html>` to force one.

## Signature (the same in every app)

| Token | Use |
| --- | --- |
| `--x-bg` | Page ground (`#ebebee` light, `#15161c` dark: xantoom.dev's) |
| `--x-surface` | A band or panel on the ground |
| `--x-raised` | Cards, fields, menus, dialogs |
| `--x-line` | Decorative separators. Never the only edge of a control |
| `--x-line-strong` | Lines that must show: outlined tags, scrollbars, emphasised dividers |
| `--x-control-border` | Edge of fields, checkboxes and switches (3:1 on every surface) |
| `--x-fg`, `--x-fg-muted`, `--x-fg-faint` | Text: body, secondary, metadata and placeholders (all 4.5:1) |
| `--x-success`, `--x-warning`, `--x-danger`, `--x-info` | Status text and marks (4.5:1). Tints: `color-mix(in oklab, var(--x-danger) 14%, transparent)` |
| `--x-on-danger` | Text on a `--x-danger` fill |
| `--x-overlay` | Modal backdrop |
| `--x-accent-hover` | Hovered links and accent text (pulled toward `--x-fg`) |
| `--x-hover`, `--x-press` | Translucent tints for hovered and pressed surfaces |
| `--x-scrollbar-thumb`, `--x-scrollbar-track` | Scrollbar colours (thumb 3:1 on every surface); set them on a box to restyle its scrollbar |
| `--x-selection`, `--x-ring` | Text selection, focus outline (`outline: var(--x-ring)`) |
| `--x-font-sans`, `--x-font-mono` | Inter, JetBrains Mono, then system fonts |
| `--x-weight-regular`, `--x-weight-medium`, `--x-weight-bold` | 400, 550, 680 |
| `--x-text-xs` … `--x-text-5xl` | 0.75, 0.875, 1, 1.125, 1.25, 1.5, 2, 2.75, 3.75 rem |
| `--x-text-display` | Fluid hero size, from 3xl to 5xl |
| `--x-leading`, `--x-leading-tight` | Line heights, raised automatically for scripts that need it |
| `--x-space-0-5` … `--x-space-24` | 0.125 to 6 rem, multiplied by the theme density |
| `--x-radius-sm`, `-md`, `-lg`, `-xl` | 0.375 to 1.375 rem, multiplied by the theme radius. Nest them concentrically: a child's radius is the parent's minus the gap |
| `--x-control` | Height of buttons and fields: 2.5 rem, or 2.75 rem on touch screens |
| `--x-size-container` | Page column (76 rem) |
| `--x-duration-fast`, `-base`, `-slow` | 160, 240, 420 ms |
| `--x-ease-out`, `--x-ease-in-out` | `cubic-bezier(0.16, 1, 0.3, 1)` is the Xantoom ease |
| `--x-shadow-sm`, `-md`, `-lg` | Two-layer shadows (ambient and direct light), darker in dark mode |

## Theme (one per app)

| Token | Use |
| --- | --- |
| `--x-fill` (`--x-fill-1..3`) | The accent gradient: primary buttons, checked controls, progress, avatars |
| `--x-on-fill` | Text and icons on the fill (4.5:1 on every stop, in both modes) |
| `--x-accent` | Accent text, links, focus ring, selected tab, thin marks (4.5:1 on every surface) |
| `--x-brand` (`--x-brand-1..3`) | The logo gradient. Decorative only |
| `--x-radius`, `--x-density` | Knobs multiplying radii and spaces |

The default stylesheet carries the `xantoom` theme. An app loads its own after it. To show several themes on one page
(a picker, a preview), load `dist/themes/all.css` and set `data-x-theme="<app>"` on a container.

## Writing CSS with tokens

```css
@layer app {
  .project-card {
    padding: var(--x-space-5);
    border-radius: var(--x-radius-lg);
    background: var(--x-raised);
    color: var(--x-fg);
    transition: translate var(--x-duration-base) var(--x-ease-out);
  }
}
```

Reach for `currentcolor`, `inherit`, `em` and `cqi` before inventing a variable. Private variables inside a component
start with `--_`.
