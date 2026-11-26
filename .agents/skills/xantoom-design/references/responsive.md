# Every screen

From a 320 px phone to an 8K monitor, ultra-wide (21:9, 32:9) and square screens, in portrait and landscape, with
touch, mouse or keyboard.

## Principles

- Components adapt to the space they get (container queries, `auto-fill` grids, wrapping flex), not to device
  names. Media queries are for the page frame (`x-shell`, dialog to bottom sheet) and for capabilities
  (`pointer: coarse`, `hover`, `prefers-*`).
- Size text in `rem` and use unitless line heights. The root size grows slowly with the viewport
  (`clamp(100%, 93.75% + 0.125vw, 137.5%)`): about 16.8 px at 1440 px and 19.8 px on a 4K-wide viewport, never below
  the user's own setting. So 8K screens get proportionate UI without zooming.
- Ultra-wide: content stays in an `x-container` (76 rem, or 120 rem with `data-width="wide"`), and text stays in 68ch
  columns (`x-prose`). Use the extra width for side panels, not for longer lines. Test it at 50 % zoom.
- Square and short screens: never assume a height. Use `dvh` and `lh`, and let dialogs scroll (`max-block-size` is
  set). Check 1:1 and landscape phones, where the keyboard leaves about 200 px.
- Touch: `--x-control` rises to 2.75 rem (44 px) under `pointer: coarse`, and fields go to 16 px. Never rely on
  hover alone.
- Safe areas: `x-container`, the dialogs and the toaster keep clear of notches and the home indicator with
  `env(safe-area-inset-*)`. Add `viewport-fit=cover` to the viewport meta only when the app draws edge to edge.

## Viewport meta

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

Never set `maximum-scale` or `user-scalable=no`.

## Check

320 × 568, 390 × 844 (and landscape), 768 × 1024, 1024 × 1024 (square), 1440 × 900, 2560 × 1080 (ultra-wide),
3840 × 2160 and 7680 × 4320 (8K, or 4K at 50 % zoom), and 200 % zoom at 1280 px. Look for horizontal scroll, clipped
text, overlapping overlays, unreachable controls and needless scrollbars (on Windows and on macOS with scroll bars
set to "Always").
