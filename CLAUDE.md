# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vixely** is a local-first, privacy-focused media editing suite that runs entirely in the browser. Files never leave the user's device — all processing happens client-side using WebAssembly.

Three main modules:

- **Video Studio** — Trim, crop, convert video (MKV, MP4, MOV → WebM). Discord Nitro file-size optimizer.
- **Image Lab** — Filters, color correction, smart export (PNG → MozJPG/Jpegli). Twitch-ready presets.
- **GIF Foundry** — Video-to-GIF with custom palette generation, frame skipping, speed control.

## Tech Stack

- **Frontend:** React 19 + TailwindCSS
- **Image Core:** Custom Rust → WebAssembly modules for pixel manipulation
- **Video Core:** Multi-threaded FFmpeg.wasm with virtual file system (zero-copy mounting)
- **Processing:** Web Workers + SharedArrayBuffer for off-main-thread work

## Code Style

- **Indentation:** Tabs (size 4) for all files; spaces for YAML
- **Line endings:** LF (enforced via `.gitattributes` and `.editorconfig`)
- **License:** MIT

## GUIDELINES

- Use Frontend design skills when doing front or design
- Think about SEO, performance, and 60fps target
