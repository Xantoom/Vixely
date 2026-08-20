import type { Translations } from "./locales/en.ts";

export type { TranslationKey, Translations } from "./locales/en.ts";

export const LOCALES = ["en", "fr", "es", "it", "de", "zh", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
	en: "English",
	fr: "Français",
	es: "Español",
	it: "Italiano",
	de: "Deutsch",
	zh: "中文",
	ja: "日本語",
};

/** Extracts `{name}` placeholders from a template literal type. */
type ExtractVariables<S extends string> = S extends `${string}{${infer V}}${infer Rest}`
	? V | ExtractVariables<Rest>
	: never;

export type TranslationValues<K extends keyof Translations> =
	ExtractVariables<Translations[K]> extends never
		? []
		: [values: Record<ExtractVariables<Translations[K]>, string | number>];

export type Translate = <K extends keyof Translations>(
	key: K,
	...values: TranslationValues<K>
) => string;

/** Every locale must cover the source locale exactly. */
export type LocaleModule = { readonly [K in keyof Translations]: string };
