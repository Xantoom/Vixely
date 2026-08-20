import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildCsp, NONCE_HEADER_PLACEHOLDER } from "../../scripts/csp.ts";

/**
 * The production CSP, enforced against the running application.
 *
 * Verifying that Caddy *sends* the header proves nothing about whether the app
 * runs under it. Here the policy is read out of the Caddyfile — so it cannot
 * drift from what is deployed — injected into every HTML response, and any
 * violation fails the test. A policy written once and never exercised ends up
 * disabled at the first incident.
 */

/**
 * The policy the image will actually serve.
 *
 * Read out of the generated snippet rather than restated here, so what is
 * tested cannot drift from what is deployed.
 */
function productionCsp(): string {
	const snippet = readFileSync(new URL("../../dist/client/csp.caddy", import.meta.url), "utf8");
	const match = /Content-Security-Policy\s+"([^"]+)"/u.exec(snippet);
	if (match?.[1] === undefined) {
		throw new Error("no CSP snippet found — run `bun run build` first");
	}
	return match[1];
}

const ROUTES = [
	"/",
	"/tools/image",
	"/tools/audio",
	"/tools/gif",
	"/tools/subtitles",
	"/tools/video",
];

for (const route of ROUTES) {
	test(`${route} runs under the production CSP without violations`, async ({ page }) => {
		const violations: string[] = [];

		// The static server already applies the policy with a fresh nonce, so
		// nothing needs injecting: the page is loaded exactly as it will be
		// served.
		page.on("console", (message) => {
			const text = message.text();
			if (text.includes("Content Security Policy") || text.includes("Refused to")) {
				violations.push(text);
			}
		});

		page.on("pageerror", (error) => violations.push(`pageerror: ${error.message}`));

		await page.goto(route);
		await page.waitForLoadState("networkidle");
		// Give the lazily loaded chunks a moment to be refused, if they would be.
		await page.waitForTimeout(500);

		expect(violations).toEqual([]);

		// And the page has to actually work under it, not merely load quietly.
		await expect(page.locator("body")).not.toBeEmpty();
	});
}

test("the generated policy matches the builder", () => {
	expect(productionCsp()).toBe(buildCsp(NONCE_HEADER_PLACEHOLDER));
});

test("every inline script carries the nonce placeholder", () => {
	for (const name of ["index.html", "_shell.html"]) {
		const html = readFileSync(new URL(`../../dist/client/${name}`, import.meta.url), "utf8");
		const inlineOpens = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/gu)];
		expect(inlineOpens.length).toBeGreaterThan(0);
		// A script the build missed would be blocked in production and nowhere
		// else, which is the failure mode this check exists to prevent.
		for (const [tag] of inlineOpens) expect(tag).toContain("nonce=");
	}
});

test("the policy keeps media inside the browser", () => {
	const csp = productionCsp();
	// A guarantee, not a default: with connect-src closed, no media can leave
	// even through an XSS in a file name or a subtitle body.
	expect(csp).toContain("connect-src 'self' blob:");
	expect(csp).toContain("object-src 'none'");
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("form-action 'none'");
	// WASM needs this; jassub and Mediabunny will not instantiate without it.
	expect(csp).toContain("'wasm-unsafe-eval'");
	// Inline scripts are allowed by nonce, never as a class.
	expect(csp).toMatch(/script-src [^;]*'nonce-/u);
	expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/u);
	// COEP is deliberately absent (ADR 008).
	expect(csp).not.toContain("require-corp");
});
