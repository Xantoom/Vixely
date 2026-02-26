import { useCallback, useEffect, useMemo, useState } from 'react';

export type EditorKey = 'video' | 'gif' | 'image';
export type TimelineMode = 'hidden' | 'compact' | 'full';
export type EditorStage = 'source' | 'edit' | 'output';

interface LayoutState {
	inspectorWidth: number;
	inspectorCollapsed: boolean;
	timelineMode: TimelineMode;
	stage: EditorStage;
}

interface UseEditorLayoutPrefsOptions {
	editor: EditorKey;
	defaultInspectorWidth: number;
	defaultTimelineMode?: TimelineMode;
	defaultStage?: EditorStage;
	minInspectorWidth?: number;
	maxInspectorWidth?: number;
}

const DEFAULT_TIMELINE_MODE: TimelineMode = 'full';
const DEFAULT_STAGE: EditorStage = 'source';

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseLayoutState(raw: string | null): Partial<LayoutState> {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return {};
		const source = parsed;
		const partial: Partial<LayoutState> = {};
		if (typeof source.inspectorWidth === 'number' && Number.isFinite(source.inspectorWidth)) {
			partial.inspectorWidth = source.inspectorWidth;
		}
		if (typeof source.inspectorCollapsed === 'boolean') {
			partial.inspectorCollapsed = source.inspectorCollapsed;
		}
		if (source.timelineMode === 'hidden' || source.timelineMode === 'compact' || source.timelineMode === 'full') {
			partial.timelineMode = source.timelineMode;
		}
		if (source.stage === 'source' || source.stage === 'edit' || source.stage === 'output') {
			partial.stage = source.stage;
		}
		return partial;
	} catch {
		return {};
	}
}

export function useEditorLayoutPrefs({
	editor,
	defaultInspectorWidth,
	defaultTimelineMode = DEFAULT_TIMELINE_MODE,
	defaultStage = DEFAULT_STAGE,
	minInspectorWidth = 280,
	maxInspectorWidth = 520,
}: UseEditorLayoutPrefsOptions) {
	const storageKey = useMemo(() => `vixely:layout:${editor}`, [editor]);

	const [state, setState] = useState<LayoutState>(() => {
		const fallback: LayoutState = {
			inspectorWidth: clamp(defaultInspectorWidth, minInspectorWidth, maxInspectorWidth),
			inspectorCollapsed: false,
			timelineMode: defaultTimelineMode,
			stage: defaultStage,
		};
		if (typeof window === 'undefined') return fallback;
		const saved = parseLayoutState(window.localStorage.getItem(storageKey));
		return {
			inspectorWidth: clamp(
				saved.inspectorWidth ?? fallback.inspectorWidth,
				minInspectorWidth,
				maxInspectorWidth,
			),
			inspectorCollapsed: saved.inspectorCollapsed ?? fallback.inspectorCollapsed,
			timelineMode: saved.timelineMode ?? fallback.timelineMode,
			stage: saved.stage ?? fallback.stage,
		};
	});

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const payload: LayoutState = {
			inspectorWidth: clamp(state.inspectorWidth, minInspectorWidth, maxInspectorWidth),
			inspectorCollapsed: state.inspectorCollapsed,
			timelineMode: state.timelineMode,
			stage: state.stage,
		};
		window.localStorage.setItem(storageKey, JSON.stringify(payload));
	}, [maxInspectorWidth, minInspectorWidth, state, storageKey]);

	const setInspectorWidth = useCallback(
		(nextWidth: number) => {
			const clamped = clamp(nextWidth, minInspectorWidth, maxInspectorWidth);
			setState((prev) => (prev.inspectorWidth === clamped ? prev : { ...prev, inspectorWidth: clamped }));
		},
		[maxInspectorWidth, minInspectorWidth],
	);

	const setInspectorCollapsed = useCallback((collapsed: boolean) => {
		setState((prev) => (prev.inspectorCollapsed === collapsed ? prev : { ...prev, inspectorCollapsed: collapsed }));
	}, []);

	const setTimelineMode = useCallback((timelineMode: TimelineMode) => {
		setState((prev) => (prev.timelineMode === timelineMode ? prev : { ...prev, timelineMode }));
	}, []);

	const setStage = useCallback((stage: EditorStage) => {
		setState((prev) => (prev.stage === stage ? prev : { ...prev, stage }));
	}, []);

	return {
		inspectorWidth: state.inspectorWidth,
		inspectorCollapsed: state.inspectorCollapsed,
		timelineMode: state.timelineMode,
		stage: state.stage,
		setInspectorWidth,
		setInspectorCollapsed,
		setTimelineMode,
		setStage,
		minInspectorWidth,
		maxInspectorWidth,
	};
}
