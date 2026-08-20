import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
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
		// After the TanStack plugins, which transform routes before JSX is
		// transformed. Only dev needs it — it supplies the React Refresh
		// runtime — which is why a green build never revealed it was missing.
		react(),
	],
	build: {
		target: "es2023",
		rollupOptions: {
			output: {
				// Mediabunny is ~300 kB and is shared by four editors: giving it
				// its own chunk keeps it out of every editor's budget and out of
				// the marketing pages entirely.
				manualChunks: (id: string) => {
					if (id.includes("node_modules/mediabunny")) return "mediabunny";
					if (id.includes("node_modules/@mediabunny/")) {
						// One chunk per codec extension, so opening the audio
						// editor does not pull down the DTS encoder.
						const match = /node_modules\/@mediabunny\/([^/]+)/u.exec(id);
						return `mediabunny-${match?.[1] ?? "extension"}`;
					}
					return undefined;
				},
			},
		},
	},
	worker: { format: "es" },
});
