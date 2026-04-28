import { useEffect } from 'react';

interface UseEditorKeyboardShortcutsOptions {
	enabled?: boolean;
	onTogglePlayback?: () => void;
	onArrowLeft?: () => void;
	onArrowRight?: () => void;
	onUndo?: () => void;
	onRedo?: () => void;
}

function isEditingTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

/**
 * Standard editor keyboard shortcuts.
 * - Space: play/pause (skipped when focus is in an input/textarea/contenteditable)
 * - Arrows: optional step
 * - Cmd/Ctrl+Z: undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y: redo
 */
export function useEditorKeyboardShortcuts({
	enabled = true,
	onTogglePlayback,
	onArrowLeft,
	onArrowRight,
	onUndo,
	onRedo,
}: UseEditorKeyboardShortcutsOptions): void {
	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const mod = e.ctrlKey || e.metaKey;
			if (mod && (onUndo || onRedo)) {
				if (e.key === 'z' && !e.shiftKey && onUndo) {
					e.preventDefault();
					onUndo();
					return;
				}
				if (((e.key === 'z' && e.shiftKey) || e.key === 'y') && onRedo) {
					e.preventDefault();
					onRedo();
					return;
				}
			}

			if (isEditingTarget(e.target)) return;

			if (e.key === ' ' && onTogglePlayback) {
				e.preventDefault();
				onTogglePlayback();
				return;
			}
			if (e.key === 'ArrowLeft' && onArrowLeft) {
				e.preventDefault();
				onArrowLeft();
				return;
			}
			if (e.key === 'ArrowRight' && onArrowRight) {
				e.preventDefault();
				onArrowRight();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [enabled, onTogglePlayback, onArrowLeft, onArrowRight, onUndo, onRedo]);
}
