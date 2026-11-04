/// <reference types="vitest/config" />
import { readFileSync, rmSync } from 'node:fs';
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

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// The preview also runs under the site's policy, so the browser checks see what it blocks.
const policy = /Content-Security-Policy "([^"]+)"/.exec(readFileSync(new URL('./nginx.conf', import.meta.url), 'utf8'))?.[1] ?? '';

export default defineConfig({
	// The app's version, written into the files it makes (ASS scripts name it as their editor).
	define: { __VIXELY_VERSION__: JSON.stringify(version) },
	plugins: [
		{
			// The examples of the editors (public/samples) are for development: production doesn't ship them.
			name: 'vixely:drop-samples',
			apply: 'build',
			closeBundle() {
				rmSync(fileURLToPath(new URL('./dist/samples', import.meta.url)), { recursive: true, force: true });
			},
		},
		tanstackRouter({ target: 'react', autoCodeSplitting: true }),
		react(),
		tailwindcss(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/paraglide',
			emitTsDeclarations: true,
			// On disk: scripts/prerender.tsx reads the messages without Vite.
			outputStructure: 'message-modules',
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
	preview: { headers: { ...isolationHeaders, 'Content-Security-Policy': policy } },
	// The manifest tells scripts/prerender.tsx which files each page needs, to announce them early.
	build: { target: 'es2023', manifest: true },
	// Workers share chunks with the app: the default format copies what they import lazily into each.
	worker: { format: 'es' },
	test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
