import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const alias = { "~": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Three tiers, because WebCodecs, WebGL and Web Audio exist in no simulated
 * DOM. Tier 1 is pure logic and runs everywhere; tiers 2 and 3 need a real
 * browser and are the only ones that prove the application works.
 */
export default defineConfig({
	resolve: { alias },
	// Fixtures are fetched by the browser tier; serving the repo root is what
	// makes `/tests/fixtures/...` resolvable from a test page.
	server: { fs: { allow: [".."] } },
	test: {
		projects: [
			{
				resolve: { alias },
				test: {
					name: "unit",
					include: ["tests/unit/**/*.test.ts"],
					environment: "node",
					testTimeout: 10_000,
				},
			},
			{
				resolve: { alias },
				test: {
					name: "browser",
					include: ["tests/browser/**/*.test.{ts,tsx}"],
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: "chromium" }, { browser: "firefox" }],
					},
				},
			},
		],
	},
});
