# GUIDELINES

This project is a Media converting, editing, exporting app fully web-client based.

## TECH STACK

- **Frontend:** React 19, Typescript 5.9, TailwindCSS 4 (custom theme), Tanstack Router, Tanstack React Query 5.
- **Server/Bundler:** Bun 1.3 for package manager, Vite Rolldown (for now in BETA 8.0.0).
- **Advanced:** You can use Rust and WebAssembly if needed.
- **Production:** Github CI/CD Pipelines with a develop branch and main branch (main = production), Deployed on Railway.com (auto deploy when Merge on main and CI passed), DNS records on Cloudflare, Domain name on Hostinger (vixely.app).
- **Environment:** On Railway, NODE_ENV=PRODUCTION, PORT=80.
- **Librairies:** Mediabunny (full docs, 3 files, in folder ./docs/mediabunny), Mediabunny extension for AC3/EAC3, JASSUB pour ASS subs, Zustand for stores, Oxlint/tsgolint for linter, Oxfmt for formatter.

## PROJECT DESCRIPTION

Vixely is a **web app**, **client-based**. Meaning I try to do everything in the client instead of the server.
Thanks to [Mediabunny library](https://mediabunny.dev/), we can do: reading, writing, and converting media files, directly in the browser.

The App has 3 functionnalities:

- **A Video editor**: Get Metadata, Trim/Cut, Resize/Crop, Color Correction, Choose tracks (audios and subtitles), Export.
- **An Image editor**: Get Metadata, Resize/Crop, Color Correction, Export. Target is [Photopea](https://www.photopea.com/).
- **A GIF editor**: Get Metadata, Trim/Cut, Resize/Crop, Color Correction, Export. Target is [Ezgif](https://ezgif.com/).

Everything except Export should be in **real-time preview**, **smooth** and **fast**.

It should be possible also to capture a frame in video editor, and either to download it, or export it to the image editor. Also from a video to the GIF editor, and from the GIF editor to the Image editor.

We should have **presets**, stored in json files to quickly edit them, to have already configured settings for differents social networks: Discord, Twitch, TikTok, Twitter, Youtube etc. Max size, codec, bitrates, quality, resolution etc.

For now, the app is free to use. Later I'll add some ads with Google Adsense I think.

## DIRECTIVES

- **Use skills** when it's needed.
- Frontend should be **modern, but clean**. Nothing fancy neons and stuffs. Dark mode only and by default.
- User experience is **vital**, the user should experience smooth, simple and fast UI (60fps minimum).
- The app should be **responsive** and should be adapted to mobile, tablet (tablet mode should be more close to mobile version), and PC (16/9 monitors, or 3/2, 21/9 or even 32/9). Every size must use the areas smartly.
- Be careful about **SEO**, **Accessibility**, **UE/NON-UE LAWS (GPDR etc.)**.
- When you finish a task, run lint then formatter, and if there is errors, fix them.
- Code should be the cleanest possible, respect best pratices and folder structure should be clear.

## Coding Style & Naming Conventions

Formatting is enforced by `.editorconfig` and `.oxfmtrc.jsonc`: tabs, width 4, UTF-8, LF, semicolons, single quotes,
trailing commas. Lint rules are in `.oxlintrc.json`.
Use TypeScript strict mode patterns. Naming:

- React components: `PascalCase` file names (for example `VideoPlayer.tsx`)
- Hooks: `useSomething.ts`
- Stores/util modules: `camelCase.ts`
  Use `@/` imports for `src/*` paths. Do not manually edit generated files such as `src/routeTree.gen.ts`.
