import { useEffect, useState } from 'react';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel } from '@/editor/Inspector';
import { isTyping, useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { MIN_CUE, removeCues, setCueTimes } from './document';
import { useSubtitleEngine } from './engine';
import { LinesPanel, SubtitleExportFooter, SubtitleExportPanel, SubtitleInfoPanel, TimingPanel } from './panels';
import { useSubtitleEditor, useSubtitleUndoState } from './store';
import { SubtitleTimeline } from './SubtitleTimeline';
import { SubtitleViewer } from './SubtitleViewer';

/**
 * Space plays; Delete removes the selected lines; I and O set the start and end of the line being
 * edited at the playhead, as in video editors.
 */
function useSubtitleShortcuts(togglePlay: () => void) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
			const state = useSubtitleEditor.getState();
			const time = state.playhead * 1000;
			const active =
				state.active === null ? undefined : state.history.present.cues.find((cue) => cue.id === state.active);
			if (event.key === ' ') {
				event.preventDefault();
				togglePlay();
			} else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection.size > 0) {
				event.preventDefault();
				const ids = state.selection;
				state.apply((doc) => removeCues(doc, ids));
				state.select([]);
			} else if ((event.key === 'i' || event.key === 'I') && active) {
				state.apply((doc) => setCueTimes(doc, active.id, time, Math.max(active.end, time + MIN_CUE)));
			} else if ((event.key === 'o' || event.key === 'O') && active) {
				state.apply((doc) => setCueTimes(doc, active.id, active.start, Math.max(time, active.start + MIN_CUE)));
			}
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === ' ' && event.target instanceof HTMLButtonElement) event.preventDefault();
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [togglePlay]);
}

export function SubtitleEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	const opened = current?.kind === 'subtitles' ? current : null;
	const undo = useSubtitleEditor((state) => state.undo);
	const redo = useSubtitleEditor((state) => state.redo);
	const owner = useSubtitleEditor((state) => state.owner);
	const { canUndo, canRedo } = useSubtitleUndoState();
	const [tool, setTool] = useState<ToolId>(initialTool ?? 'info');
	const engine = useSubtitleEngine(opened);
	// The document belongs to the file on screen once it has been read.
	const ready = opened !== null && owner === opened && !engine.unreadable;

	useEditorShortcuts({ undo, redo });
	useSubtitleShortcuts(engine.togglePlay);

	const inspector = () => {
		if (!opened || !ready) return <FilePanel opened={opened} />;
		if (tool === 'lines') return <LinesPanel engine={engine} />;
		if (tool === 'timing') return <TimingPanel engine={engine} />;
		if (tool === 'export') return <SubtitleExportPanel />;
		return <SubtitleInfoPanel opened={opened} engine={engine} />;
	};

	const viewer = () => {
		if (opened && engine.unreadable) return <p className="text-body text-danger">{m.subs_unreadable()}</p>;
		if (ready) return <SubtitleViewer engine={engine} title={opened.file.name.replace(/\.[^.]+$/, '')} />;
		return <Viewer kind="subtitles" opened={opened} />;
	};

	return (
		<EditorLayout
			kind="subtitles"
			fileName={opened?.file.name}
			tool={tool}
			onTool={setTool}
			actions={{
				canUndo,
				canRedo,
				onUndo: undo,
				onRedo: redo,
				onExport: ready
					? () => {
							setTool('export');
						}
					: undefined,
				exportActive: tool === 'export',
			}}
			viewer={viewer()}
			timeline={ready ? <SubtitleTimeline engine={engine} /> : undefined}
			inspector={inspector()}
			inspectorFooter={
				tool === 'export' && ready ? <SubtitleExportFooter file={opened.file} engine={engine} /> : undefined
			}
		/>
	);
}
