import { create } from 'zustand';

export type EditorKey = 'video' | 'image' | 'gif';

type UnsavedMap = Record<EditorKey, boolean>;

interface EditorSessionState {
	unsavedByEditor: UnsavedMap;
	setUnsaved: (editor: EditorKey, value: boolean) => void;
}

const DEFAULT_UNSAVED: UnsavedMap = { video: false, image: false, gif: false };

export const useEditorSessionStore = create<EditorSessionState>((set) => ({
	unsavedByEditor: { ...DEFAULT_UNSAVED },
	setUnsaved: (editor, value) => {
		set((state) => {
			if (state.unsavedByEditor[editor] === value) return state;
			return { unsavedByEditor: { ...state.unsavedByEditor, [editor]: value } };
		});
	},
}));
