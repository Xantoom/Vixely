import { useCallback, useEffect, useState } from 'react';
import { useResponsiveLayout } from './useResponsiveLayout.ts';

export type EditorKey = 'video' | 'gif' | 'image';
export type EditorStage = 'source' | 'edit' | 'output';

interface LayoutState {
	stage: EditorStage;
	sidebarOpen: boolean;
	sidebarCollapsed: boolean;
}

interface UseEditorLayoutPrefsOptions {
	editor: EditorKey;
	defaultInspectorWidth?: number;
	defaultStage?: EditorStage;
	minInspectorWidth?: number;
	maxInspectorWidth?: number;
}

const DEFAULT_STAGE: EditorStage = 'source';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseLayoutState(raw: string | null): Partial<LayoutState> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return {};
		const partial: Partial<LayoutState> = {};
		if (parsed.stage === 'source' || parsed.stage === 'edit' || parsed.stage === 'output') {
			partial.stage = parsed.stage;
		}
		if (typeof parsed.sidebarCollapsed === 'boolean') {
			partial.sidebarCollapsed = parsed.sidebarCollapsed;
		}
		return partial;
	} catch {
		return {};
	}
}

export function useEditorLayoutPrefs({ editor, defaultStage = DEFAULT_STAGE }: UseEditorLayoutPrefsOptions) {
	const { tier } = useResponsiveLayout();
	const storageKey = `vixely:layout:${editor}`;

	const [state, setState] = useState<LayoutState>(() => {
		const fallback: LayoutState = { stage: defaultStage, sidebarOpen: false, sidebarCollapsed: false };
		if (typeof window === 'undefined') return fallback;
		const saved = parseLayoutState(window.localStorage.getItem(storageKey));
		return {
			stage: saved.stage ?? fallback.stage,
			sidebarOpen: false,
			sidebarCollapsed: saved.sidebarCollapsed ?? false,
		};
	});

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const payload = { stage: state.stage, sidebarCollapsed: state.sidebarCollapsed };
		window.localStorage.setItem(storageKey, JSON.stringify(payload));
	}, [state, storageKey]);

	const setStage = useCallback((stage: EditorStage) => {
		setState((prev) => (prev.stage === stage ? prev : { ...prev, stage }));
	}, []);

	const setSidebarOpen = useCallback((open: boolean) => {
		setState((prev) => (prev.sidebarOpen === open ? prev : { ...prev, sidebarOpen: open }));
	}, []);

	const toggleSidebarCollapsed = useCallback(() => {
		setState((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
	}, []);

	return {
		tier,
		stage: state.stage,
		sidebarOpen: state.sidebarOpen,
		sidebarCollapsed: state.sidebarCollapsed,
		setStage,
		setSidebarOpen,
		toggleSidebarCollapsed,
	};
}
