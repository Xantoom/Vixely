import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'vixely:theme';
const darkQuery = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

function mode(): ThemeMode {
	const chosen = document.documentElement.dataset.theme;
	return chosen === 'light' || chosen === 'dark' ? chosen : 'system';
}

function resolved(): ResolvedTheme {
	const chosen = mode();
	if (chosen !== 'system') return chosen;
	return darkQuery?.matches ? 'dark' : 'light';
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
	listeners.add(listener);
	darkQuery?.addEventListener('change', listener);
	return () => {
		listeners.delete(listener);
		darkQuery?.removeEventListener('change', listener);
	};
}

/**
 * Light, dark, or the system's (the default). The choice is applied before the first paint by the
 * inline script in index.html; the system's is followed live.
 */
export function setThemeMode(next: ThemeMode) {
	const root = document.documentElement;
	if (next === 'system') delete root.dataset.theme;
	else root.dataset.theme = next;
	try {
		if (next === 'system') localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, next);
	} catch {
		// Storage can be unavailable (private mode). The choice then lasts for this page only.
	}
	for (const listener of listeners) listener();
}

/** The mode chosen, and the theme it shows now. */
export function useTheme(): { mode: ThemeMode; theme: ResolvedTheme } {
	const chosen = useSyncExternalStore(subscribe, mode, (): ThemeMode => 'system');
	const theme = useSyncExternalStore(subscribe, resolved, (): ResolvedTheme => 'light');
	return { mode: chosen, theme };
}
