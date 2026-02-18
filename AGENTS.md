# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React app:

- `components/` UI and editor feature components (`video/`, `image/`, `gif/`, `ui/`)
- `routes/` TanStack Router route files (`routes/tools/*` for editor pages)
- `stores/` Zustand state stores
- `hooks/`, `utils/`, `config/` shared logic and runtime config

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
Left sidebar on every page. Upper bar and right sidebar on editors pages. Three main editors with real-time preview:

- Image Editor
- GIF Editor
- Video Editor

## Tech Stack

- **Frontend:** React 19 + TailwindCSS
- **Libraries:** Mediabunny (docs in docs/mediabunny) with extension ac3 and mp3-encoder, Zustand, Tanstack Router, Tanstack Query, Bun + Vite. Using Bun as a package manager.
- **Production:** Deployed on Railway, Code on Github, DNS on Cloudflare, Domain name on Hostinger.
- **Environment Variables:** On Railway, NODE_ENV=PRODUCTION, and PORT=80.

## GUIDELINES

- Use oxlint (.oxlintrc.json) and Oxfmt (.oxfmtrc.jsonc)
- **Always** use skills, like vercel-react-best-practices, or frontend-design.
- Think about SEO, performance (every action should be the fastest for user), and 60fps target.
- Don't write comments if unnecessary.
- Be careful about UI and UX design, always think about User experience.
- Be careful about responsive (should work on ANY device).
