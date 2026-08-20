import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * These run against the built static output rather than the dev server: the
 * dev server injects its own client and rewrites modules, which is exactly
 * what would hide a CSP violation that production would hit.
 */
export default defineConfig({
	testDir: "./tests/e2e",
	testMatch: "**/*.spec.ts",
	fullyParallel: true,
	forbidOnly: Boolean(process.env["CI"]),
	retries: process.env["CI"] === undefined ? 0 : 1,
	reporter: process.env["CI"] === undefined ? "list" : [["list"], ["github"]],
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		// Not `vite preview`: it rewrites HTML on the fly, which changes the
		// inline scripts and therefore their hashes, hiding whether the real
		// policy works.
		command: "PORT=4173 bun scripts/serve-static.ts",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: process.env["CI"] === undefined,
		timeout: 120_000,
	},
});
