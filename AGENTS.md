# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React app:
- `components/` UI and editor feature components (`video/`, `image/`, `gif/`, `ui/`)
- `routes/` TanStack Router route files (`routes/tools/*` for editor pages)
- `stores/` Zustand state stores
- `hooks/`, `utils/`, `workers/`, `config/` shared logic and runtime config
- `wasm/` generated Rust bindings/artifacts consumed by the app

Rust/WASM source lives in `vixely-core/` (Cargo crate). Static assets are in `public/`. Deployment and infra docs are in `docs/`. Build output goes to `dist/` (do not edit manually).

## Build, Test, and Development Commands
- `bun install` installs dependencies and runs `postinstall` (`setup:ffmpeg`).
- `bun run dev` starts the Vite dev server.
- `bun run build` creates a production bundle in `dist/`.
- `bun run preview` serves the production build locally.
- `bun run build:wasm` rebuilds Rust WASM bindings from `vixely-core/` into `src/wasm/`.
- `bun run lint` runs Oxlint.
- `bun run lint:fix` applies auto-fixable lint changes.
- `bun run fmt` formats with Oxfmt.
- `bun run fmt:check` verifies formatting (used in CI).

## Coding Style & Naming Conventions
Formatting is enforced by `.editorconfig` and `.oxfmtrc.jsonc`: tabs, width 4, UTF-8, LF, semicolons, single quotes, trailing commas. Lint rules are in `.oxlintrc.json`.

Use TypeScript strict mode patterns. Naming:
- React components: `PascalCase` file names (for example `VideoPlayer.tsx`)
- Hooks: `useSomething.ts`
- Stores/util modules: `camelCase.ts`

Use `@/` imports for `src/*` paths. Do not manually edit generated files such as `src/routeTree.gen.ts`.

## Testing Guidelines
There is currently no dedicated unit-test suite in the repository. Treat this as the minimum verification set before opening a PR:
1. `bun run lint`
2. `bun run fmt:check`
3. `bun run build:wasm` (if Rust/WASM code changed)
4. `bun run build`

Also smoke-test impacted flows in `/tools/video`, `/tools/image`, and `/tools/gif`.

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
- Be careful about repsonsive (should work on ANY device).
