# Vixely

Video, image, GIF, audio and subtitle editors that run entirely in the browser: files never leave the device. Static
site, no backend. Read this before changing anything.

## Stack

React 19, TypeScript, Tailwind CSS 4, Vite, Bun, TanStack Router, Zustand, Paraglide (English and French), Mediabunny,
WebCodecs, WebGL2, and Rust crates compiled to WebAssembly (`vixely-*`). Served by nginx on Railway from the `Dockerfile`.

## Commands

```bash
bun install && bun run dev
bun run typecheck && bun run lint && bun run fmt:check && bun run test
bun run test:rust
```

- Browser scenarios are in `e2e/` (see its README). Run them with `JOBS=1` when a result looks odd: under load the dev
  server makes some of them time out.
- After changing a patched package, delete `node_modules/.vite` and restart the dev server.

## Layout

- `src/editors/<kind>`: one folder per editor; `src/editor`: what they share; `src/media`: reading, decoding, saving.
- `src/workers`: everything heavy runs off the main thread. `src/document`: rules shared by timed editors.
- `src/app`: site shell, pages and the service worker's client; `messages/`: every string, in both languages.
- `patches/`: bun patches of Mediabunny (TrueHD in transport streams, HDR, 10 bits) and JASSUB. Port them when upgrading: `bun patch <pkg>`,
  reapply with `patch -p1`, delete any `.rej` or `.orig` left behind, then `bun patch --commit`.
- `vendor/gifski`: gifski without threads for WebAssembly, see its `VIXELY.md`.

## Rules of the product

- Nothing of the user's files is ever sent anywhere. Any new request to another site goes in the privacy page.
- Encoding on the graphics card that fails offers a retry in software. No silent fallback.
- A size limit is a ceiling: it never inflates a file, and estimates must be honest.
- 7.1 TrueHD is decoded as 5.1, because Web Audio drops dialogue with 8 channels; copying keeps the 7.1.

## Rules of the interface

- Quiet flat chrome; colour only carries meaning. System font stack. No gradients, glows, cards in panels or ALL CAPS.
- As little text as possible: icons with short tooltips, no marketing copy, no em dashes. Text must fit in both languages.
- Everything clickable has `cursor: pointer`; what drags sideways has `ew-resize`.
- Alerts are in-app dialogs, never `alert()` or `confirm()`. Scrollbars are always the app's own.
- Export is a tab of the tool rail. Zoom has no buttons, only wheel and keyboard. Every editor can close its file.
- Phones: media full width at the top, then the timeline, the panel and the tool bar at the bottom.
- Aim for 120 fps: animate only `transform` and `opacity`, no CSS blur on large areas.
- Check every interface change in French and English at 1440, 1100, 820 and 390 px, light and dark.

## Local files

Personal tooling stays out of the repository: `.claude/`, `.impeccable/` and the like are ignored and must not be added.
