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

/** Reads the theme preference before React mounts, to avoid a light flash. */
export const THEME_BOOTSTRAP_SCRIPT = `(()=>{try{const s=localStorage.getItem(${JSON.stringify(
	STORAGE_KEY,
)});if(!s)return;const t=JSON.parse(s)?.state?.theme;if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);const l=JSON.parse(s)?.state?.locale;if(l)document.documentElement.setAttribute("lang",l);}catch{}})()`;
