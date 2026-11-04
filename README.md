<div align="center">

<img alt="Vixely" src="public/favicon.svg" width="64" height="64" />

# Vixely

**Edit video, images, GIFs, audio and subtitles in your browser. Nothing is uploaded.**

[vixely.app](https://vixely.app)

</div>

## What it does

| Editor    | Opens                                     | Tools                                                                    |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Video     | MP4, M4V, MKV, WebM, MOV                  | Trim, crop, resize, speed, colour, layers, sound and subtitle tracks     |
| Image     | JPEG, PNG, WebP, AVIF, JPEG XL, HEIC, BMP, TIFF, ICO | Crop, resize, colour, layers, format conversion                |
| GIF       | GIF, APNG, animated WebP                  | Trim, crop, frame editing, size optimisation                             |
| Audio     | MP3, WAV, FLAC, Ogg, Opus, M4A, AAC, MKA  | Trim, volume, loudness, noise reduction                                  |
| Subtitles | SRT, VTT, ASS, SSA, SUP                   | Lines, timing, styles, translation, muxing into video                    |

AVI, FLV, WMV, MPEG and OGV are refused: neither Mediabunny nor WebCodecs reads them.

Files are read, edited and saved on the device. The site works offline once loaded and can be installed as an app.

## Development

Needs [Bun](https://bun.sh), Rust with the `wasm32-unknown-unknown` target, [wasm-pack](https://github.com/wasm-bindgen/wasm-pack), clang and llvm. The multithreaded image codecs also need the nightly toolchain pinned in `scripts/build-wasm.ts`, with its `rust-src` component.

```bash
bun install
bun run dev
```

```bash
bun run typecheck && bun run lint && bun run test && bun run test:rust
```

Browser scenarios are in [e2e](e2e/README.md). The `Dockerfile` builds the site and serves it with nginx.

## Built with

React, TypeScript, Tailwind CSS, Vite, TanStack Router, Zustand, Mediabunny, WebCodecs, WebGL2, and Rust compiled to WebAssembly.

## Links

[Privacy](https://vixely.app/privacy) · [Terms](https://vixely.app/terms) · [Legal notice](https://vixely.app/legal)

## License

[AGPL-3.0](LICENSE)
