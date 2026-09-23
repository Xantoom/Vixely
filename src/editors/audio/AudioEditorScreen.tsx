import { useEffect, useState } from 'react';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel, ToolLater } from '@/editor/Inspector';
import { useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { AudioTimeline } from './AudioTimeline';
import { cut, setTrim } from './document';
import { type AudioEngine, useAudioEngine } from './engine';
import { TrimPanel, VolumePanel } from './panels';
import { useAudioEditor, useAudioUndoState } from './store';

/** Seconds the arrow keys move the playhead; with Shift, ten times more. */
const ARROW_STEP = 1;

/** Whether the user is typing text, where every key belongs to the field. */
function isTyping(target: EventTarget | null): boolean {
	return (
		(target instanceof HTMLInputElement && target.type !== 'range') ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

/** Sliders use the arrows, Home and End themselves. */
function isSlider(target: EventTarget | null): boolean {
	return (
		(target instanceof HTMLInputElement && target.type === 'range') ||
		(target instanceof HTMLElement && target.getAttribute('role') === 'slider')
	);
}

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * Space plays and pauses, Delete removes the selection, I and O set where the audio starts and
 * ends, the arrows move the playhead, Home and End jump to the edges of the kept audio.
 */
function useAudioShortcuts(engine: AudioEngine) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
			if (isSlider(event.target) && SLIDER_KEYS.has(event.key)) return;
			const state = useAudioEditor.getState();
			const doc = state.history.present;
			const handled = () => {
				event.preventDefault();
			};
			switch (event.key) {
				case ' ':
					// Like in every editor, Space plays even when a button has focus; Enter still presses it.
					handled();
					engine.togglePlay();
					break;
				case 'Delete':
				case 'Backspace':
					if (!state.selection) return;
					handled();
					state.apply((current) => (state.selection ? cut(current, state.selection) : current));
					state.setSelection(null);
					break;
				case 'i':
				case 'I':
					handled();
					state.apply((current) => setTrim(current, { ...current.trim, start: state.playhead }));
					break;
				case 'o':
				case 'O':
					handled();
					state.apply((current) => setTrim(current, { ...current.trim, end: state.playhead }));
					break;
				case 'ArrowLeft':
				case 'ArrowRight': {
					handled();
					const step = (event.shiftKey ? 10 : 1) * ARROW_STEP * (event.key === 'ArrowLeft' ? -1 : 1);
					engine.seek(Math.min(doc.duration, Math.max(0, state.playhead + step)));
					break;
				}
				case 'Home':
					handled();
					engine.seek(doc.trim.start);
					break;
				case 'End':
					handled();
					engine.seek(doc.trim.end);
					break;
				case 'Escape':
					if (state.selection) state.setSelection(null);
					break;
				default:
			}
		};
		// A focused button would also be pressed when Space is released.
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === ' ' && event.target instanceof HTMLButtonElement) event.preventDefault();
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [engine]);
}

export function AudioEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	const opened = current?.kind === 'audio' ? current : null;
	const duration = opened?.info?.duration ?? 0;
	const editable = opened !== null && duration > 0 && opened.info?.audio !== null;
	const load = useAudioEditor((state) => state.load);
	const undo = useAudioEditor((state) => state.undo);
	const redo = useAudioEditor((state) => state.redo);
	const { canUndo, canRedo } = useAudioUndoState();
	const [tool, setTool] = useState<ToolId>(initialTool ?? 'info');
	const engine = useAudioEngine(editable ? opened.file : null, duration);

	useEffect(() => {
		if (opened && editable) load(opened.file, duration);
	}, [opened, editable, duration, load]);

	useEditorShortcuts({ undo, redo });
	useAudioShortcuts(engine);

	const inspector = () => {
		if (tool === 'info' || !editable) return <FilePanel opened={opened} />;
		if (tool === 'trim') return <TrimPanel />;
		if (tool === 'volume') return <VolumePanel engine={engine} />;
		return <ToolLater kind="audio" tool={tool} />;
	};

	return (
		<EditorLayout
			kind="audio"
			fileName={opened?.file.name}
			tool={tool}
			onTool={setTool}
			actions={{ canUndo, canRedo, onUndo: undo, onRedo: redo }}
			viewer={<Viewer kind="audio" opened={opened} />}
			timeline={editable ? <AudioTimeline engine={engine} /> : undefined}
			inspector={inspector()}
		/>
	);
}
