import { useEffect } from 'react';

/**
 * Whether a key press goes to a text field rather than to the editor, or to a dialog open over
 * it. Shortcuts of a dialog pass `inDialog`: the dialog then doesn't stop them.
 */
export function isTyping(target: EventTarget | null, inDialog = false): boolean {
	return (
		(!inDialog && document.querySelector('dialog[open]') !== null) ||
		(target instanceof HTMLInputElement && target.type !== 'range') ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

/** Undo and redo with the usual shortcuts: Ctrl or ⌘ + Z, Ctrl or ⌘ + Shift + Z, and Ctrl + Y. */
export function useEditorShortcuts({
	undo,
	redo,
	inDialog = false,
}: {
	undo: () => void;
	redo: () => void;
	inDialog?: boolean;
}) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || isTyping(event.target, inDialog)) return;
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
	}, [undo, redo, inDialog]);
}
