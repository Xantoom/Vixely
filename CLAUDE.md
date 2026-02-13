# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vixely** is a local-first, privacy-focused media editing suite that runs entirely in the browser. Files never leave
the user's device.

Left sidebar on every page. Upper bar et right sidebar on editors pages. Three main editors with real-time preview:

- **Video:** (Blue) Cut/trim, resize, adjustable sliders (color correction, effects etc.), export (codec, container,
  bitrate or cq, etc.).
- **Image:** (Orange) Resize, adjustable sliders (color correction, effects etc.), export (format, quality).
- **GIF:** (Green) Create GIF from Video, Resize, edit settings (frames, framerate, etc.), adjustable sliders (color
  correction, effects etc.), export (quality etc.)

## Tech Stack

- **Frontend:** React 19 + TailwindCSS
- **Image Core:** Custom Rust → WebAssembly modules for pixel manipulation
- **Video Core:** Multi-threaded FFmpeg.wasm with virtual file system (zero-copy mounting)
- **Processing:** Web Workers + SharedArrayBuffer for off-main-thread work
- **Libraries:** Zustand, Tanstack Router, Tanstack Query, Bun + Vite.
- **Production:** Deployed on Railway, Code on Github, DNS on Cloudflare, Domain name on Hostinger.
- **Environment Variables:** On Railway, NODE_ENV=PRODUCTION, and PORT=80.

## GUIDELINES

- Use oxlint (.oxlintrc.json) and Oxfmt (.oxfmtrc.jsonc)
- Use Frontend design skills when doing front or design
- Think about SEO, performance (every action should be the fastest for user), and 60fps target.
- **Always** use skills, like vercel-react-best-practices.
- Don't write comments if unnecessary.
- Be careful about UI and UX design, always think about User experience.
- Be careful about repsonsive (should work on ANY device).
