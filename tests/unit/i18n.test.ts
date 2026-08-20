import { describe, expect, it } from "vitest";
import { en } from "~/i18n/locales/en.ts";
import { de } from "~/i18n/locales/de.ts";
import { es } from "~/i18n/locales/es.ts";
import { fr } from "~/i18n/locales/fr.ts";
import { it as italian } from "~/i18n/locales/it.ts";
import { ja } from "~/i18n/locales/ja.ts";
import { zh } from "~/i18n/locales/zh.ts";
import { createTranslate } from "~/i18n/config.ts";
import {
	formatBytes,
	formatDuration,
	formatNumber,
	formatPercent,
	formatTimecode,
	interpolate,
	negotiateLocale,
} from "~/i18n/format.ts";
import { LOCALES, type Locale, type LocaleModule } from "~/i18n/types.ts";

const MODULES: Record<Exclude<Locale, "en">, LocaleModule> = { fr, es, it: italian, de, zh, ja };
const SOURCE_KEYS = Object.keys(en).toSorted();

function placeholders(value: string): string[] {
	return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).toSorted();
}

describe.each(Object.entries(MODULES))("%s locale", (name, module) => {
	it("covers every source key, with no extras", () => {
		expect(Object.keys(module).toSorted()).toEqual(SOURCE_KEYS);
	});

	it("carries exactly the interpolation variables of the source", () => {
		for (const key of SOURCE_KEYS) {
			expect({ key, vars: placeholders(module[key as keyof LocaleModule]) }).toEqual({
				key,
				vars: placeholders(en[key as keyof typeof en]),
			});
		}
	});

	it("leaves no string empty", () => {
		for (const [key, value] of Object.entries(module)) {
			expect(value.trim(), `${name}.${key}`).not.toBe("");
		}
	});

	it("does not leave English copy in place for prose keys", () => {
		// Product name and format names legitimately match; prose must not.
		const prose = ["home.hero.title", "app.tagline", "export.done"] as const;
		for (const key of prose) {
			expect(module[key], `${name}.${key}`).not.toBe(en[key]);
		}
	});
});

describe("translator", () => {
	it("interpolates typed values", () => {
		const t = createTranslate(en);
		expect(t("canvas.zoomLevel", { percent: 150 })).toBe("Zoom 150%");
	});

	it("falls back to English per key, not per locale", () => {
		const partial = { ...en, "action.undo": "Annuler" } as LocaleModule;
		const t = createTranslate(partial);
		expect(t("action.undo")).toBe("Annuler");
		expect(t("action.redo")).toBe(en["action.redo"]);
	});

	it("leaves an unknown placeholder visible instead of blanking it", () => {
		expect(interpolate("Zoom {percent}%", {})).toBe("Zoom {percent}%");
	});
});

describe("locale negotiation from the OS", () => {
	it.each([
		[["fr-FR", "fr", "en"], "fr"],
		[["de-AT"], "de"],
		[["zh-Hans-CN"], "zh"],
		[["pt-BR", "es-ES"], "es"],
		[["ko-KR"], "en"],
		[[], "en"],
	] as const)("%s resolves to %s", (preferred, expected) => {
		expect(negotiateLocale(preferred, LOCALES, "en")).toBe(expected);
	});
});

describe("Intl formatting", () => {
	it("formats byte sizes per locale", () => {
		expect(formatBytes("en", 0)).toMatch(/0/);
		expect(formatBytes("en", 1536)).toMatch(/1\.5/);
		expect(formatBytes("en", 5 * 1024 ** 3)).toMatch(/5/);
	});

	it("formats percentages and numbers", () => {
		expect(formatPercent("en", 0.42)).toBe("42%");
		expect(formatNumber("en", 1234.5, 1)).toBe("1,234.5");
	});

	it("formats timecodes without locale drift", () => {
		expect(formatTimecode(0)).toBe("00:00");
		expect(formatTimecode(61)).toBe("01:01");
		expect(formatTimecode(3661)).toBe("1:01:01");
		expect(formatTimecode(1.5, true)).toBe("00:01.500");
		expect(formatTimecode(-5)).toBe("-00:05");
	});

	it("formats durations in prose", () => {
		expect(formatDuration("en", 0)).toBe("0s");
		expect(formatDuration("en", 3725)).toContain("1h");
	});
});
