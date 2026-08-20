import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
	contrastRatio,
	ensureContrast,
	parseHex,
	relativeLuminance,
	WCAG_AA_NORMAL,
	WCAG_AAA_NORMAL,
	WCAG_NON_TEXT,
} from "~/ui/theme/contrast.ts";
import { CATPPUCCIN_LATTE, CATPPUCCIN_MACCHIATO } from "~/ui/theme/palette.ts";
import { buildThemeTokens, CONTRAST_CONTRACT, tokenContrast } from "~/ui/theme/tokens.ts";
import { renderTokensCss } from "../../scripts/generate-tokens.ts";

const THEMES = ["light", "dark"] as const;

describe("contrast maths", () => {
	it("matches the WCAG reference values", () => {
		expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
		expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.478, 2);
	});

	it("is symmetric", () => {
		expect(contrastRatio("#1e66f5", "#eff1f5")).toBeCloseTo(
			contrastRatio("#eff1f5", "#1e66f5"),
			10,
		);
	});

	it("parses both hex forms", () => {
		expect(parseHex("#fff")).toEqual(parseHex("#ffffff"));
		expect(() => parseHex("#xyz")).toThrow(/invalid hex/);
	});

	it("orders luminance as expected", () => {
		expect(relativeLuminance("#ffffff")).toBeGreaterThan(relativeLuminance("#808080"));
		expect(relativeLuminance("#000000")).toBe(0);
	});
});

describe("ensureContrast", () => {
	it("leaves a compliant colour untouched", () => {
		const compliant = "#4c4f69";
		expect(ensureContrast(compliant, "#eff1f5", WCAG_AA_NORMAL)).toBe(compliant);
	});

	it("darkens a pale accent on a light background until it clears AA", () => {
		const adjusted = ensureContrast(CATPPUCCIN_LATTE.peach, CATPPUCCIN_LATTE.base, WCAG_AA_NORMAL);
		expect(contrastRatio(adjusted, CATPPUCCIN_LATTE.base)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
		expect(relativeLuminance(adjusted)).toBeLessThan(relativeLuminance(CATPPUCCIN_LATTE.peach));
	});

	it("lightens on a dark background instead of darkening", () => {
		const adjusted = ensureContrast("#3a3a3a", "#181926", WCAG_AA_NORMAL);
		expect(relativeLuminance(adjusted)).toBeGreaterThan(relativeLuminance("#3a3a3a"));
	});

	it("is deterministic, so the generated stylesheet is reproducible", () => {
		const a = ensureContrast(CATPPUCCIN_LATTE.teal, CATPPUCCIN_LATTE.base, WCAG_AA_NORMAL);
		const b = ensureContrast(CATPPUCCIN_LATTE.teal, CATPPUCCIN_LATTE.base, WCAG_AA_NORMAL);
		expect(a).toBe(b);
	});
});

describe("Catppuccin is not AA-conformant as shipped", () => {
	// Recorded so a future change to the derivation cannot quietly drop it.
	it("fails on Latte accents over base", () => {
		expect(contrastRatio(CATPPUCCIN_LATTE.peach, CATPPUCCIN_LATTE.base)).toBeLessThan(
			WCAG_AA_NORMAL,
		);
		expect(contrastRatio(CATPPUCCIN_LATTE.yellow, CATPPUCCIN_LATTE.base)).toBeLessThan(
			WCAG_AA_NORMAL,
		);
	});

	it("passes on Macchiato accents over base", () => {
		expect(contrastRatio(CATPPUCCIN_MACCHIATO.peach, CATPPUCCIN_MACCHIATO.base)).toBeGreaterThan(
			WCAG_AA_NORMAL,
		);
	});
});

describe.each(THEMES)("derived tokens clear WCAG in the %s theme", (theme) => {
	const tokens = buildThemeTokens(theme);

	it.each(CONTRAST_CONTRACT.surfaces)("body text reaches AAA on %s", (surface) => {
		expect(tokenContrast(tokens, "--text", surface)).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL);
	});

	it.each(CONTRAST_CONTRACT.surfaces)("secondary text reaches AA on %s", (surface) => {
		expect(tokenContrast(tokens, "--text-muted", surface)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
	});

	it.each(CONTRAST_CONTRACT.surfaces)("disabled text stays legible on %s", (surface) => {
		expect(tokenContrast(tokens, "--text-subtle", surface)).toBeGreaterThanOrEqual(WCAG_NON_TEXT);
	});

	it.each(
		CONTRAST_CONTRACT.accentText.flatMap((accent) =>
			CONTRAST_CONTRACT.surfaces.map((surface) => [accent, surface] as const),
		),
	)("%s reaches AA on %s", (accent, surface) => {
		expect(tokenContrast(tokens, accent, surface)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
	});

	it.each(CONTRAST_CONTRACT.solidPairs)("%s carries %s at AA", (solid, on) => {
		expect(tokenContrast(tokens, on, solid)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
	});

	it.each(
		CONTRAST_CONTRACT.nonText.flatMap((token) =>
			CONTRAST_CONTRACT.surfaces.map((surface) => [token, surface] as const),
		),
	)("%s meets the non-text bar on %s", (token, surface) => {
		expect(tokenContrast(tokens, token, surface)).toBeGreaterThanOrEqual(WCAG_NON_TEXT);
	});

	it("gives each editor a visually distinct accent", () => {
		const accents = ["image", "video", "gif", "audio", "subtitles"].map(
			(editor) => tokens[`--accent-${editor}`] as string,
		);
		expect(new Set(accents).size).toBe(accents.length);
	});
});

describe("generated stylesheet", () => {
	it("matches the derivation — regenerate with `bun scripts/generate-tokens.ts`", () => {
		const committed = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8");
		expect(committed).toBe(renderTokensCss());
	});
});
