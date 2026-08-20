import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_LOCALE, LOCALES, loadLocale, negotiateLocale, type Locale } from "~/i18n";
import type { LocaleModule } from "~/i18n/types.ts";
import { en } from "~/i18n/locales/en.ts";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export type PreferencesState = {
	theme: ThemePreference;
	locale: Locale;
	/** True until the OS locale has been read once, so it is not overwritten. */
	localeChosenByUser: boolean;
	messages: LocaleModule;
	setTheme: (theme: ThemePreference) => void;
	setLocale: (locale: Locale) => Promise<void>;
	initialise: () => Promise<void>;
};

const STORAGE_KEY = "vixely.preferences";

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
	if (preference === "system") return prefersDark ? "dark" : "light";
	return preference;
}

/** D4: only preferences are persisted. Never a document, never media. */
export const usePreferences = create<PreferencesState>()(
	persist(
		(set, get) => ({
			theme: "system",
			locale: DEFAULT_LOCALE,
			localeChosenByUser: false,
			messages: en,

			setTheme: (theme) => {
				set({ theme });
				applyTheme(theme);
			},

			setLocale: async (locale) => {
				const messages = await loadLocale(locale);
				set({ locale, messages, localeChosenByUser: true });
				applyLocale(locale);
			},

			initialise: async () => {
				const state = get();
				const locale = state.localeChosenByUser
					? state.locale
					: negotiateLocale(readNavigatorLocales(), LOCALES, DEFAULT_LOCALE);
				const messages = await loadLocale(locale);
				set({ locale, messages });
				applyTheme(state.theme);
				applyLocale(locale);
			},
		}),
		{
			name: STORAGE_KEY,
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				theme: state.theme,
				locale: state.locale,
				localeChosenByUser: state.localeChosenByUser,
			}),
		},
	),
);

function readNavigatorLocales(): readonly string[] {
	if (typeof navigator === "undefined") return [];
	return navigator.languages ?? [navigator.language];
}

/**
 * The resolved theme is written to `data-theme` on `<html>`; the stylesheet
 * does the rest. Under `system` the attribute is removed so the media query in
 * tokens.css takes over, which keeps the OS switch live without a listener.
 */
export function applyTheme(preference: ThemePreference): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	if (preference === "system") {
		root.removeAttribute("data-theme");
	} else {
		root.setAttribute("data-theme", preference);
	}
}

export function applyLocale(locale: Locale): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute("lang", locale);
}

/**
 * Where the theme bootstrap lives.
 *
 * A separate file rather than an inline script: React re-creates the elements
 * it manages in `head`, and a re-created inline script loses the nonce the
 * server stamped on it, so the CSP blocks it — visible only in production,
 * which is the worst place to find out. The cost is one small blocking request
 * from the same origin, which the cache absorbs after the first visit.
 */
export const THEME_BOOTSTRAP_SRC = "/theme.js";

/** The script's body, written to public/theme.js by scripts/theme-bootstrap.ts. */
export const THEME_BOOTSTRAP_SOURCE = `(()=>{try{const s=localStorage.getItem(${JSON.stringify(
	STORAGE_KEY,
)});if(!s)return;const p=JSON.parse(s)?.state;if(p?.theme==="light"||p?.theme==="dark")document.documentElement.setAttribute("data-theme",p.theme);if(p?.locale)document.documentElement.setAttribute("lang",p.locale);}catch{}})()`;
