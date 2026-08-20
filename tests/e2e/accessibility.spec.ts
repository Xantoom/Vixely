import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility, checked rather than declared.
 *
 * WCAG 2.2 AA is the target, and axe covers the part a machine can see:
 * contrast, names, roles, landmarks. What it cannot see — whether the keyboard
 * order makes sense, whether an announcement is useful — is reviewed by hand,
 * and this suite is not a substitute for that.
 */

const ROUTES = [
	"/",
	"/tools/image",
	"/tools/video",
	"/tools/gif",
	"/tools/audio",
	"/tools/subtitles",
];

for (const route of ROUTES) {
	test(`${route} has no automatically detectable accessibility violations`, async ({ page }) => {
		await page.goto(route);
		await page.waitForLoadState("networkidle");

		const results = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
			.analyze();

		// The violations are printed in full rather than counted: a failure with
		// nothing to look at cannot be diagnosed.
		expect(
			results.violations.map((violation) => ({
				id: violation.id,
				impact: violation.impact,
				nodes: violation.nodes.length,
				help: violation.help,
			})),
		).toEqual([]);
	});
}

test.describe("both themes", () => {
	for (const theme of ["light", "dark"] as const) {
		test(`the home page passes contrast checks in the ${theme} theme`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: theme });
			await page.goto("/");
			await page.waitForLoadState("networkidle");

			const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
			const contrast = results.violations.filter((violation) => violation.id === "color-contrast");
			expect(contrast).toEqual([]);
		});
	}
});

test("the first stop for a keyboard user is the skip link", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("networkidle");

	await page.keyboard.press("Tab");
	const first = await page.evaluate(() => document.activeElement?.textContent ?? "");
	expect(first).toContain("Skip to content");

	// And the focus ring must be visible, not suppressed.
	const outline = await page.evaluate(() => {
		const active = document.activeElement;
		return active === null ? "" : getComputedStyle(active).outlineStyle;
	});
	expect(outline).not.toBe("none");
});

test("prefers-reduced-motion removes the transitions", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
	await page.waitForLoadState("networkidle");

	const duration = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--duration-panel").trim(),
	);
	// getComputedStyle normalises the unit, so 0ms comes back as 0s.
	expect(["0s", "0ms"]).toContain(duration);
});
