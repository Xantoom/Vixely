import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		wasm(),
	],

	resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },

	optimizeDeps: {
		exclude: ["jassub"],
		include: ["jassub > throughput"],
	},

	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "credentialless",
		},
	},

	build: {
		target: "esnext",
		cssMinify: "lightningcss",
		reportCompressedSize: false,
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (
						id.includes("node_modules/react-dom") ||
						id.includes("node_modules/react/")
					) {
						return "react";
					}
					if (id.includes("node_modules/@tanstack/react-router")) {
						return "router";
					}
				},
			},
		},
	},
});
