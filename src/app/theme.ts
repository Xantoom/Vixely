import { useSyncExternalStore } from 'react';

export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'vixely:theme';
const darkQuery = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

function read(): ResolvedTheme {
	const chosen = document.documentElement.dataset.theme;
	if (chosen === 'light' || chosen === 'dark') return chosen;
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
 * The theme follows the system until the user picks one. The choice is applied before the first
 * paint by the inline script in index.html.
 */
export function useTheme(): [ResolvedTheme, () => void] {
	const theme = useSyncExternalStore(subscribe, read, (): ResolvedTheme => 'light');
	const toggle = () => {
		const next: ResolvedTheme = read() === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Storage can be unavailable (private mode). The choice then lasts for this page only.
		}
		for (const listener of listeners) listener();
	};
	return [theme, toggle];
}
