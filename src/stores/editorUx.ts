import { create } from 'zustand';
import { DEFAULT_EDITOR_UX_MODE, EDITOR_UX_STORAGE_KEY } from '@/config/editorUx.ts';

export type EditorUxMode = 'simple' | 'expert';

const DEFAULT_MODE: EditorUxMode = DEFAULT_EDITOR_UX_MODE;

function parseMode(raw: unknown): EditorUxMode | null {
	if (raw === 'simple' || raw === 'expert') return raw;
	return null;
}

function readModeFromStorage(): EditorUxMode {
	if (typeof window === 'undefined') return DEFAULT_MODE;
	try {
		const raw = window.localStorage.getItem(EDITOR_UX_STORAGE_KEY);
		return parseMode(raw) ?? DEFAULT_MODE;
	} catch {
		return DEFAULT_MODE;
	}
}

function writeModeToStorage(mode: EditorUxMode): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(EDITOR_UX_STORAGE_KEY, mode);
	} catch {
		// Ignore storage write failures (privacy mode, quota, etc.).
	}
}

interface EditorUxState {
	mode: EditorUxMode;
	hydrated: boolean;
	setMode: (mode: EditorUxMode) => void;
	hydrateFromStorage: () => void;
}

export const useEditorUxStore = create<EditorUxState>((set) => ({
	mode: DEFAULT_MODE,
	hydrated: false,
	setMode: (mode) => {
		set((prev) => {
			if (prev.mode === mode) return prev;
			writeModeToStorage(mode);
			return { mode, hydrated: true };
		});
	},
	hydrateFromStorage: () => {
		const mode = readModeFromStorage();
		set((prev) => (prev.mode === mode && prev.hydrated ? prev : { mode, hydrated: true }));
	},
}));
