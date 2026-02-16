# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React app:

- `components/` UI and editor feature components (`video/`, `image/`, `gif/`, `ui/`)
- `routes/` TanStack Router route files (`routes/tools/*` for editor pages)
- `stores/` Zustand state stores
- `hooks/`, `utils/`, `workers/`, `config/` shared logic and runtime config
- `wasm/` generated Rust bindings/artifacts consumed by the app

Rust/WASM source lives in `vixely-core/` (Cargo crate). Static assets are in `public/`. Deployment and infra docs are in
`docs/`. Build output goes to `dist/` (do not edit manually).

## Coding Style & Naming Conventions

Formatting is enforced by `.editorconfig` and `.oxfmtrc.jsonc`: tabs, width 4, UTF-8, LF, semicolons, single quotes,
trailing commas. Lint rules are in `.oxlintrc.json`.

Use TypeScript strict mode patterns. Naming:

- React components: `PascalCase` file names (for example `VideoPlayer.tsx`)
- Hooks: `useSomething.ts`
- Stores/util modules: `camelCase.ts`

Use `@/` imports for `src/*` paths. Do not manually edit generated files such as `src/routeTree.gen.ts`.

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
- **Libraries:** Zustand, Tanstack Router, Tanstack Query, Bun + Vite. Using Bun as a package manager.
- **Production:** Deployed on Railway, Code on Github, DNS on Cloudflare, Domain name on Hostinger.
- **Environment Variables:** On Railway, NODE_ENV=PRODUCTION, and PORT=80.

## GUIDELINES

- Use oxlint (.oxlintrc.json) and Oxfmt (.oxfmtrc.jsonc)
- Use Frontend design skills when doing front or design
- Think about SEO, performance (every action should be the fastest for user), and 60fps target.
- **Always** use skills, like vercel-react-best-practices.
- Don't write comments if unnecessary.
- Be careful about UI and UX design, always think about User experience.
- Be careful about responsive (should work on ANY device).
- Always respect the instructions. Do not try to look for alternative that does not fullfill the desire of the prompt.
- If something doesn't work, don't make a fallback and help me investigate or find the problem.
- **THE APP FOLDER STRUCTURE SHOULD BE THINK AROUND VIDEO / IMAGE / GIF / COMMON (BETWEEN THE THREE)**
