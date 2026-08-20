import { en } from "./locales/en.ts";
import { interpolate } from "./format.ts";
import { LOCALES, type Locale, type LocaleModule, type Translate } from "./types.ts";

export const DEFAULT_LOCALE: Locale = "en";

/** Locales are separate chunks: a French visitor never downloads Japanese. */
const LOADERS: Record<Locale, () => Promise<LocaleModule>> = {
	en: async () => en,
	fr: async () => (await import("./locales/fr.ts")).fr,
	es: async () => (await import("./locales/es.ts")).es,
	it: async () => (await import("./locales/it.ts")).it,
	de: async () => (await import("./locales/de.ts")).de,
	zh: async () => (await import("./locales/zh.ts")).zh,
	ja: async () => (await import("./locales/ja.ts")).ja,
};

const cache = new Map<Locale, LocaleModule>([["en", en]]);

export async function loadLocale(locale: Locale): Promise<LocaleModule> {
	const cached = cache.get(locale);
	if (cached !== undefined) return cached;
	const loaded = await LOADERS[locale]();
	cache.set(locale, loaded);
	return loaded;
}

export function getLoadedLocale(locale: Locale): LocaleModule | undefined {
	return cache.get(locale);
}

/**
 * Builds a translator. Falls back to English per key rather than per locale, so
 * a partially loaded module still renders something readable.
 */
export function createTranslate(messages: LocaleModule): Translate {
	return ((key, values) =>
		interpolate(messages[key] ?? en[key], values as Record<string, string | number>)) as Translate;
}

export { LOCALES, DEFAULT_LOCALE as FALLBACK_LOCALE };
export type { Locale, Translate };
