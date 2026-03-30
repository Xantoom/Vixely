import { useCallback, useEffect, useState } from 'react';
import { useResponsiveLayout } from './useResponsiveLayout.ts';

export type EditorKey = 'video' | 'gif' | 'image';

interface LayoutState {
	sidebarOpen: boolean;
	sidebarCollapsed: boolean;
}

interface UseEditorLayoutPrefsOptions {
	editor: EditorKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseLayoutState(raw: string | null): Partial<LayoutState> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return {};
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
	const { tier } = useResponsiveLayout();
	const storageKey = `vixely:layout:${editor}`;

	const [state, setState] = useState<LayoutState>(() => {
		const fallback: LayoutState = { sidebarOpen: false, sidebarCollapsed: false };
		if (typeof window === 'undefined') return fallback;
		const saved = parseLayoutState(window.localStorage.getItem(storageKey));
		return { sidebarOpen: false, sidebarCollapsed: saved.sidebarCollapsed ?? false };
	});

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const payload = { sidebarCollapsed: state.sidebarCollapsed };
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
