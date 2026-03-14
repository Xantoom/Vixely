import { useCallback, useEffect, useState } from 'react';
import { useResponsiveLayout, type LayoutTier } from './useResponsiveLayout.ts';

export type EditorKey = 'video' | 'gif' | 'image';
export type EditorStage = 'source' | 'edit' | 'output';

interface LayoutState {
	inspectorWidth: number;
	stage: EditorStage;
	sidebarOpen: boolean;
	sidebarCollapsed: boolean;
}

interface UseEditorLayoutPrefsOptions {
	editor: EditorKey;
	defaultInspectorWidth: number;
	defaultStage?: EditorStage;
	minInspectorWidth?: number;
	maxInspectorWidth?: number;
}

const DEFAULT_STAGE: EditorStage = 'source';

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function maxWidthForTier(tier: LayoutTier, override?: number): number {
	if (override) return override;
	return tier === 'ultrawide' ? 640 : 520;
}

function parseLayoutState(raw: string | null): Partial<LayoutState> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return {};
		const partial: Partial<LayoutState> = {};
		if (typeof parsed.inspectorWidth === 'number' && Number.isFinite(parsed.inspectorWidth)) {
			partial.inspectorWidth = parsed.inspectorWidth;
		}
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

export function useEditorLayoutPrefs({
	editor,
	defaultInspectorWidth,
	defaultStage = DEFAULT_STAGE,
	minInspectorWidth = 280,
	maxInspectorWidth: maxWidthOverride,
}: UseEditorLayoutPrefsOptions) {
	const { tier } = useResponsiveLayout();
	const storageKey = `vixely:layout:${editor}`;
	const effectiveMaxWidth = maxWidthForTier(tier, maxWidthOverride);

	const [state, setState] = useState<LayoutState>(() => {
		const fallback: LayoutState = {
			inspectorWidth: clamp(defaultInspectorWidth, minInspectorWidth, effectiveMaxWidth),
			stage: defaultStage,
			sidebarOpen: false,
			sidebarCollapsed: false,
		};
		if (typeof window === 'undefined') return fallback;
		const saved = parseLayoutState(window.localStorage.getItem(storageKey));
		return {
			inspectorWidth: clamp(
				saved.inspectorWidth ?? fallback.inspectorWidth,
				minInspectorWidth,
				effectiveMaxWidth,
			),
			stage: saved.stage ?? fallback.stage,
			sidebarOpen: false,
			sidebarCollapsed: saved.sidebarCollapsed ?? false,
		};
	});

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const payload = {
			inspectorWidth: clamp(state.inspectorWidth, minInspectorWidth, effectiveMaxWidth),
			stage: state.stage,
			sidebarCollapsed: state.sidebarCollapsed,
		};
		window.localStorage.setItem(storageKey, JSON.stringify(payload));
	}, [effectiveMaxWidth, minInspectorWidth, state, storageKey]);

	const setInspectorWidth = useCallback(
		(nextWidth: number) => {
			const clamped = clamp(nextWidth, minInspectorWidth, effectiveMaxWidth);
			setState((prev) => (prev.inspectorWidth === clamped ? prev : { ...prev, inspectorWidth: clamped }));
		},
		[effectiveMaxWidth, minInspectorWidth],
	);

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
		inspectorWidth: state.inspectorWidth,
		stage: state.stage,
		sidebarOpen: state.sidebarOpen,
		sidebarCollapsed: state.sidebarCollapsed,
		setInspectorWidth,
		setStage,
		setSidebarOpen,
		toggleSidebarCollapsed,
		minInspectorWidth,
		maxInspectorWidth: effectiveMaxWidth,
	};
}
