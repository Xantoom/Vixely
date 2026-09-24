import { useEffect } from 'react';

/** Whether a key press goes to a text field rather than to the editor. */
export function isTyping(target: EventTarget | null): boolean {
	return (
		(target instanceof HTMLInputElement && target.type !== 'range') ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

/** Undo and redo with the usual shortcuts: Ctrl or ⌘ + Z, Ctrl or ⌘ + Shift + Z, and Ctrl + Y. */
export function useEditorShortcuts({ undo, redo }: { undo: () => void; redo: () => void }) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || isTyping(event.target)) return;
			const key = event.key.toLowerCase();
			if (key === 'z' && !event.shiftKey) {
				event.preventDefault();
				undo();
			} else if ((key === 'z' && event.shiftKey) || key === 'y') {
				event.preventDefault();
				redo();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [undo, redo]);
}
