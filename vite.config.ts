/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Cross-origin isolation enables SharedArrayBuffer, which the multithreaded WASM encoders need.
// Production serves the same headers from nginx.conf.
const isolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
	plugins: [
		tanstackRouter({ target: 'react', autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/paraglide',
			emitTsDeclarations: true,
			// Client-only app: remember the choice locally, otherwise follow the browser language.
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
		}),
	],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	// JASSUB finds its worker and WASM next to its own files: it must stay out of the pre-bundle,
	// which only takes the packages it imports.
	optimizeDeps: {
		exclude: ['jassub'],
		include: [
			'jassub > abslink',
			'jassub > abslink/w3c',
			'jassub > lfa-ponyfill',
			'jassub > rvfc-polyfill',
			'jassub > throughput',
		],
	},
	server: { headers: isolationHeaders },
	preview: { headers: isolationHeaders },
	build: { target: 'es2023' },
	test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
