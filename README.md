# Vixely

A web application for editing images, video, GIFs, audio and subtitles. All
processing happens in the browser through WebCodecs and WebGL; no file is
uploaded, and the site has no backend and no database.

Live at [vixely.app](https://vixely.app).

## What it does

| Editor    | Capabilities                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------ |
| Image     | Format conversion, crop, resize with a choice of resampling, colour correction, filters, text     |
| Video     | Frame-accurate trimming, track selection and editing, filters, text, codec and container control  |
| GIF       | Frame timeline, reordering, delays, palette quantisation, dithering, conversion to video formats  |
| Audio     | Cut and rearrange, EBU R128 normalisation, equaliser, filters, format conversion                  |
| Subtitles | Cue and style editing for SRT, WebVTT and ASS/SSA; timing and positioning for PGS                 |

Supported formats are listed in [`public/llms.txt`](public/llms.txt).

## Status

Under construction, with all five editors implemented and the shared core in
place. What is not done: the site is not deployed, so nothing here has been
exercised on real hardware at scale, and the visual identity beyond the
monogram is unfinished. [`PLAN.md`](PLAN.md) describes the phases and their
exit criteria.

## How it works

- **Rendering** goes through a single WebGL2 graph. Preview and export use the
  same graph fed by the same source, which is what keeps what you see and what
  you get identical.
- **Media** is handled by [Mediabunny](https://mediabunny.dev) over WebCodecs.
  Subtitle containers are handled by an in-house Matroska reader and muxer,
  because Mediabunny reads no subtitle track.
- **Undo/redo** is a command bus shared by every editor. Dragging a slider
  produces one history entry, not forty.
- **Nothing is persisted** except your theme, language and export presets.

## Browser support

Every browser is served, and the application states what it cannot do where it
runs rather than failing silently.

| | Chrome / Edge | Firefox | Safari 26+ | Safari < 26 | Firefox Android |
| --- | --- | --- | --- | --- | --- |
| Video editing | yes | yes | yes | yes | no |
| Audio editing | yes | yes | yes | no (passthrough only) | no |
| Streaming export to disk | yes | no | no | no | — |
| Practical export ceiling | none | ~2 GB | ~2 GB | ~2 GB | — |

Outside Chromium the output file is assembled in memory, so the application
estimates the size and warns before the export starts.

## Development

Requires [Bun](https://bun.sh) 1.4.0. It is the only JavaScript runtime used;
Node is not part of the toolchain.

```bash
bun install
bun run dev          # http://localhost:3000
bun run ci           # typecheck, lint, format, unit tests, build, bundle budget
bun run test:browser # components and media, in Chromium and Firefox
bun run test:e2e     # accessibility and the production CSP, against the build
```

Browser tests need Playwright browsers: `bun x playwright install chromium firefox`.

Three tiers, because WebCodecs, WebGL and Web Audio exist in no simulated DOM:
pure logic runs under Bun, components and media run in real browsers, and the
end-to-end suite runs against the built static output with the production
security headers applied.

## Deployment

The build produces static files only. The Docker image is a Caddy container
serving `dist/client`; no JavaScript process runs in production. The
Content-Security-Policy allows no inline script except by per-request nonce,
and `connect-src` stays closed — which is what guarantees no media can leave
the browser even through an XSS.

```bash
docker build -t vixely .
docker run -p 8080:8080 vixely
```

## Stack

TypeScript 7 · React 19 · TanStack Start (SPA mode, prerendered marketing
routes) · Vite 8 · Tailwind CSS 4 · Zustand · Mediabunny · react-aria-components ·
oxlint and oxfmt · Vitest and Playwright · Bun · Caddy.

## Licence

MIT. See [LICENSE](LICENSE).
