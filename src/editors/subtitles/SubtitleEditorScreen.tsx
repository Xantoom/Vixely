import { useEffect, useState } from 'react';
import { useDropHandler } from '@/app/GlobalDrop';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel } from '@/editor/Inspector';
import { isTyping, useEditorShortcuts } from '@/editor/shortcuts';
import { EmptyViewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { identify } from '@/media/identify';
import { usePlayback } from '@/media/playback';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { AROUND, AudioBox } from './AudioBox';
import { lastEnd, MIN_CUE, removeCues, setCueTimes, gridLines } from './document';
import { EditBox } from './EditBox';
import { LineGrid } from './LineGrid';
import { SubtitleExportFooter, SubtitleExportPanel, SubtitleInfoPanel, TimingPanel } from './panels';
import { useProjectReady, useSubtitleProject } from './project';
import { useSubtitleDoc, useSubtitleEditor, useSubtitleUndoState } from './store';
import { SubtitleBatchScreen } from './SubtitleBatchScreen';
import { SubtitleViewer } from './SubtitleViewer';

/** Room after the last line when there is no video, so lines can be placed after it. */
const TAIL = 10;

/**
 * Keys of Aegisub where they make sense here: Space plays, R plays the line, Q and W the half
 * second before and after it; I and O set its start and end at the playhead; Delete removes the
 * selected lines.
 */
function useSubtitleShortcuts() {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
			const state = useSubtitleEditor.getState();
			const playback = usePlayback.getState();
			const time = playback.time * 1000;
			const active =
				state.active === null ? undefined : state.history.present.cues.find((cue) => cue.id === state.active);
			const key = event.key.toLowerCase();
			if (event.key === ' ') {
				event.preventDefault();
				playback.toggle();
			} else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection.size > 0) {
				event.preventDefault();
				const ids = state.selection;
				const lines = gridLines(state.history.present);
				const after = lines
					.slice(lines.findIndex((cue) => cue.id === state.active))
					.find((cue) => !ids.has(cue.id));
				state.apply((doc) => removeCues(doc, ids));
				state.select(after ? [after.id] : []);
			} else if (!active) {
				return;
			} else if (key === 'r') {
				playback.playRange(active.start / 1000, active.end / 1000);
			} else if (key === 'q') {
				playback.playRange(Math.max(0, active.start / 1000 - AROUND), active.start / 1000);
			} else if (key === 'w') {
				playback.playRange(active.end / 1000, active.end / 1000 + AROUND);
			} else if (key === 'i') {
				state.apply((doc) => setCueTimes(doc, active.id, time, Math.max(active.end, time + MIN_CUE)));
			} else if (key === 'o') {
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
	}, []);
}

/**
 * Aegisub's layout: the video top left, the sound of the line top right with the line's edit box
 * under it, and every line in a grid below.
 */
function Workspace({ title }: { title: string }) {
	return (
		<div className="grid h-full min-h-0 gap-3 p-3 max-lg:grid-rows-[max(240px,56vw)_180px_220px_60vh] max-lg:overflow-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)]">
			<div className="min-h-0 min-w-0">
				<SubtitleViewer title={title} />
			</div>
			<div className="grid min-h-0 min-w-0 gap-3 max-lg:contents lg:grid-rows-[minmax(0,1fr)_minmax(150px,auto)]">
				<div className="min-h-0 min-w-0">
					<AudioBox />
				</div>
				<div className="min-h-0 min-w-0">
					<EditBox />
				</div>
			</div>
			<div className="min-h-0 min-w-0 lg:col-span-2">
				<LineGrid />
			</div>
		</div>
	);
}

/** One subtitle file or track, or several files processed together. */
export function SubtitleEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const batch = useSession((state) => (state.batchKind === 'subtitles' ? state.batch : null));
	if (batch) return <SubtitleBatchScreen batch={batch} />;
	return <SingleSubtitleScreen initialTool={initialTool} />;
}

function SingleSubtitleScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	const opened = current?.kind === 'subtitles' ? current : null;
	const open = useSubtitleProject((state) => state.open);
	const status = useSubtitleProject((state) => state.status);
	const progress = useSubtitleProject((state) => state.progress);
	const source = useSubtitleProject((state) => state.source);
	const projectFile = useSubtitleProject((state) => state.file);
	const undo = useSubtitleEditor((state) => state.undo);
	const redo = useSubtitleEditor((state) => state.redo);
	const { canUndo, canRedo } = useSubtitleUndoState();
	const doc = useSubtitleDoc();
	const setClockLength = usePlayback((state) => state.setClockLength);
	const [tool, setTool] = useState<ToolId>(initialTool && initialTool !== 'lines' ? initialTool : 'info');
	const projectReady = useProjectReady();
	const ready = opened !== null && projectFile === opened.file && projectReady;

	useEffect(() => {
		if (opened) open(opened);
	}, [opened, open]);

	// Without a video, time runs to the last line and a little more.
	const end = lastEnd(doc) / 1000 + TAIL;
	useEffect(() => {
		setClockLength(end);
	}, [end, setClockLength]);

	// Leaving the editor stops playback; the position stays for when it comes back.
	useEffect(
		() => () => {
			usePlayback.getState().pause();
		},
		[],
	);

	useEditorShortcuts({ undo, redo });
	useSubtitleShortcuts();

	// A video dropped on subtitles opened from a file plays under them, as in Aegisub.
	useDropHandler(async (files) => {
		const [file] = files;
		if (!ready || files.length !== 1 || !file || source === 'video') return false;
		const result = await identify(file);
		if (!result.ok || (result.value.kind !== 'video' && result.value.kind !== 'audio')) return false;
		usePlayback.getState().load(file);
		return true;
	});

	const inspector = () => {
		if (!opened || !ready) return <FilePanel opened={opened} />;
		if (tool === 'timing') return <TimingPanel />;
		if (tool === 'export') return <SubtitleExportPanel opened={opened} />;
		return <SubtitleInfoPanel opened={opened} />;
	};

	const waiting = () => {
		if (!opened) return <EmptyViewer kind="subtitles" />;
		if (status === 'unreadable') return <p className="text-body text-danger">{m.subs_unreadable()}</p>;
		return (
			<p className="text-body text-muted tabular">
				{source === 'video'
					? m.subs_reading_track({ percent: Math.floor(progress * 100) })
					: m.drop_reading({ name: opened.file.name })}
			</p>
		);
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
			viewer={ready ? undefined : waiting()}
			workspace={ready ? <Workspace title={opened.file.name.replace(/\.[^.]+$/, '')} /> : undefined}
			inspector={inspector()}
			inspectorFooter={tool === 'export' && ready ? <SubtitleExportFooter opened={opened} /> : undefined}
		/>
	);
}
