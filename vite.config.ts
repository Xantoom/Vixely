import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import { resolve } from "node:path";

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
		tailwindcss(),
		wasm(),
	],

	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},

	server: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},

	preview: {
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},

	build: {
		target: "esnext",
		cssMinify: "lightningcss",
		reportCompressedSize: false,
		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
						return "react";
					}
					if (id.includes("node_modules/@tanstack/react-router")) {
						return "router";
					}
					if (id.includes("node_modules/@ffmpeg")) {
						return "ffmpeg";
					}
				},
			},
		},
	},
});
