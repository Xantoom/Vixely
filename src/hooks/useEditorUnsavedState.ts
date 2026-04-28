import { useEffect } from 'react';
import { type EditorKey, useEditorSessionStore } from '@/stores/editorSession.ts';
import { usePreventUnload } from './usePreventUnload.ts';

/**
 * Couples beforeunload prevention with the global editor session unsaved-flag.
 * Replaces the same useEffect repeated across video/gif/image routes.
 */
export function useEditorUnsavedState(editor: EditorKey, isDirty: boolean): void {
	usePreventUnload(isDirty);
	const setEditorUnsaved = useEditorSessionStore((s) => s.setUnsaved);

	useEffect(() => {
		setEditorUnsaved(editor, isDirty);
		return () => {
			setEditorUnsaved(editor, false);
		};
	}, [editor, isDirty, setEditorUnsaved]);
}
