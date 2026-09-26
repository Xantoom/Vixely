import { useSyncExternalStore } from 'react';
import { getLocale, type Locale, setLocale } from '@/paraglide/runtime.js';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** The interface language. Components that show text re-render when it changes. */
export function useLocale(): Locale {
	return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/** Switches the language in place: nothing reloads, work in progress stays. */
export function changeLocale(next: Locale) {
	if (next === getLocale()) return;
	void setLocale(next, { reload: false });
	document.documentElement.lang = next;
	for (const listener of listeners) listener();
}

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };
