import { useCallback, useEffect, useState } from 'react';

export type EditorKey = 'video' | 'gif' | 'image';
export type LayoutTier = 'mobile' | 'tablet' | 'desktop' | 'ultrawide';

const LAYOUT_SCHEMA_VERSION = 1;
const BREAKPOINTS = { sm: 640, lg: 1024, uw: 1920 } as const;

interface LayoutState {
	sidebarOpen: boolean;
	sidebarCollapsed: boolean;
}

interface UseEditorLayoutPrefsOptions {
	editor: EditorKey;
}

function getTier(): LayoutTier {
	if (typeof window === 'undefined') return 'desktop';
	const w = window.innerWidth;
	if (w < BREAKPOINTS.sm) return 'mobile';
	if (w < BREAKPOINTS.lg) return 'tablet';
	if (w < BREAKPOINTS.uw) return 'desktop';
	return 'ultrawide';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseLayoutState(storageKey: string, raw: string | null): Partial<LayoutState> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return {};
		if (typeof parsed.v !== 'number' || parsed.v !== LAYOUT_SCHEMA_VERSION) {
			if (typeof window !== 'undefined') {
				try {
					window.localStorage.removeItem(storageKey);
				} catch {
					// ignore
				}
			}
			return {};
		}
		const partial: Partial<LayoutState> = {};
		if (typeof parsed.sidebarCollapsed === 'boolean') {
			partial.sidebarCollapsed = parsed.sidebarCollapsed;
		}
		return partial;
	} catch {
		return {};
	}
}

export function useEditorLayoutPrefs({ editor }: UseEditorLayoutPrefsOptions) {
	const [tier, setTier] = useState<LayoutTier>(getTier);
	const storageKey = `vixely:layout:${editor}`;

	const [state, setState] = useState<LayoutState>(() => {
		const fallback: LayoutState = { sidebarOpen: false, sidebarCollapsed: false };
		if (typeof window === 'undefined') return fallback;
		const saved = parseLayoutState(storageKey, window.localStorage.getItem(storageKey));
		return { sidebarOpen: false, sidebarCollapsed: saved.sidebarCollapsed ?? false };
	});

	useEffect(() => {
		const queries = [
			window.matchMedia(`(min-width: ${BREAKPOINTS.sm}px)`),
			window.matchMedia(`(min-width: ${BREAKPOINTS.lg}px)`),
			window.matchMedia(`(min-width: ${BREAKPOINTS.uw}px)`),
		];

		let rafId = 0;
		const update = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				setTier(getTier());
			});
		};

		for (const mq of queries) mq.addEventListener('change', update);
		return () => {
			cancelAnimationFrame(rafId);
			for (const mq of queries) mq.removeEventListener('change', update);
		};
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const payload = { v: LAYOUT_SCHEMA_VERSION, sidebarCollapsed: state.sidebarCollapsed };
		window.localStorage.setItem(storageKey, JSON.stringify(payload));
	}, [state, storageKey]);

	const setSidebarOpen = useCallback((open: boolean) => {
		setState((prev) => (prev.sidebarOpen === open ? prev : { ...prev, sidebarOpen: open }));
	}, []);

	const toggleSidebarCollapsed = useCallback(() => {
		setState((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
	}, []);

	return {
		tier,
		sidebarOpen: state.sidebarOpen,
		sidebarCollapsed: state.sidebarCollapsed,
		setSidebarOpen,
		toggleSidebarCollapsed,
	};
}
