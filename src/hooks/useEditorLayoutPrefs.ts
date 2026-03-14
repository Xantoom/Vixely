import { useCallback, useEffect, useState } from 'react';

export type EditorKey = 'video' | 'gif' | 'image';
export type EditorStage = 'source' | 'edit' | 'output';

interface LayoutState {
	inspectorWidth: number;
	stage: EditorStage;
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
	defaultStage = DEFAULT_STAGE,
	minInspectorWidth = 280,
	maxInspectorWidth = 520,
}: UseEditorLayoutPrefsOptions) {
	const storageKey = `vixely:layout:${editor}`;

	const [state, setState] = useState<LayoutState>(() => {
		const fallback: LayoutState = {
			inspectorWidth: clamp(defaultInspectorWidth, minInspectorWidth, maxInspectorWidth),
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
			stage: saved.stage ?? fallback.stage,
		};
	});

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const payload: LayoutState = {
			inspectorWidth: clamp(state.inspectorWidth, minInspectorWidth, maxInspectorWidth),
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

	const setStage = useCallback((stage: EditorStage) => {
		setState((prev) => (prev.stage === stage ? prev : { ...prev, stage }));
	}, []);

	return {
		inspectorWidth: state.inspectorWidth,
		stage: state.stage,
		setInspectorWidth,
		setStage,
		minInspectorWidth,
		maxInspectorWidth,
	};
}
