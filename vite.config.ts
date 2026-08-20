import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		alias: {
			"~": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	plugins: [
		tailwindcss(),
		tanstackStart({
			// D1: static SPA output. `spa` produces `_shell.html` for the
			// editors; the root `prerender` writes a real HTML file per
			// marketing route, which is where the SEO comes from.
			// The shell lives at its own path so `/` stays a real prerendered
			// page; without this the shell overwrites the home page's HTML.
			spa: { enabled: true, maskPath: "/app" },
			prerender: {
				enabled: true,
				crawlLinks: true,
				// Editors are behind the shell: prerendering them would ship an
				// empty frame with no content to index.
				filter: (page) => !page.path.startsWith("/tools"),
				failOnError: true,
			},
			pages: [{ path: "/", prerender: { enabled: true } }],
			sitemap: { enabled: true, host: "https://vixely.app" },
		}),
	],
	build: {
		target: "es2023",
		rollupOptions: {
			output: {
				// Codec extensions and editors must never land in the entry chunk.
				manualChunks: undefined,
			},
		},
	},
	worker: { format: "es" },
});
