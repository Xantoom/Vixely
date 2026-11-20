import { useSyncExternalStore } from 'react';
import { getLocale, type Locale, setLocale } from '@/paraglide/runtime.js';

/**
 * The interface language, and its place in the address: French pages are under /fr
 * (/fr/video), English ones have no prefix, so search engines list each language on its own.
 * The router works on addresses without the prefix (main.tsx: rewrite).
 */

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

const PREFIX = '/fr';

/** Whether an address is a French page's. */
export function isFrenchPath(path: string): boolean {
	return path === PREFIX || path.startsWith(`${PREFIX}/`);
}

/** An address without its language: /fr/video is /video. */
export function barePath(path: string): string {
	return isFrenchPath(path) ? path.slice(PREFIX.length) || '/' : path;
}

/** An address in a language: /video in French is /fr/video. */
export function localePath(path: string, locale: Locale = getLocale()): string {
	const bare = barePath(path);
	if (locale !== 'fr') return bare;
	return bare === '/' ? PREFIX : `${PREFIX}${bare}`;
}

/** Replaces the address without a new entry in the history: the router's own, once it runs. */
let replaceAddress = (href: string) => {
	history.replaceState(history.state, '', href);
};

export function setAddressReplacer(replace: (href: string) => void) {
	replaceAddress = replace;
}

/** The address bar follows the language, and so do the links, which the router writes from it. */
function followInAddress(locale: Locale) {
	const path = localePath(location.pathname, locale);
	if (path !== location.pathname) replaceAddress(`${path}${location.search}${location.hash}`);
}

/**
 * Before the app starts: a French address shows French; any other shows the language chosen
 * before, or the browser's, and its address says which.
 */
export function startLocale() {
	if (isFrenchPath(location.pathname)) void setLocale('fr', { reload: false });
	document.documentElement.lang = getLocale();
	followInAddress(getLocale());
}

/** Switches the language in place: nothing reloads, work in progress stays. */
export function changeLocale(next: Locale) {
	if (next === getLocale()) return;
	void setLocale(next, { reload: false });
	document.documentElement.lang = next;
	followInAddress(next);
	for (const listener of listeners) listener();
}

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };
