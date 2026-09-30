import { useEffect, useState } from 'react';
import { useDropHandler } from '@/app/GlobalDrop';
import { useLeaveGuard } from '@/app/leave-guard';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel } from '@/editor/Inspector';
import { useEditorShortcuts } from '@/editor/shortcuts';
import { EmptyViewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { identify } from '@/media/identify';
import { usePlayback } from '@/media/playback';
import { useOpened, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { lastEnd } from './document';
import { FindPanel } from './FindPanel';
import { SubtitleExportFooter, SubtitleExportPanel, SubtitleInfoPanel, TimingPanel } from './panels';
import { isPictures, useProjectReady, useSubtitleProject } from './project';
import { useSubtitleDoc, useSubtitleEditor, useSubtitleUndoState } from './store';
import { StylesPanel } from './StylesPanel';
import { SubtitleBatchScreen } from './SubtitleBatchScreen';
import { OcrPanel, TranslatePanel } from './tools';
import { useSubtitleShortcuts, Workspace } from './Workspace';

/** Room after the last line when there is no video, so lines can be placed after it. */
const TAIL = 10;

/** One subtitle file or track, or several files processed together. */
export function SubtitleEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const batch = useSession((state) => (state.batchKind === 'subtitles' ? state.batch : null));
	if (batch) return <SubtitleBatchScreen batch={batch} />;
	return <SingleSubtitleScreen initialTool={initialTool} />;
}

function SingleSubtitleScreen({ initialTool }: { initialTool?: ToolId }) {
	const opened = useOpened('subtitles');
	const open = useSubtitleProject((state) => state.open);
	const status = useSubtitleProject((state) => state.status);
	const progress = useSubtitleProject((state) => state.progress);
	const source = useSubtitleProject((state) => state.source);
	const projectFile = useSubtitleProject((state) => state.file);
	const undo = useSubtitleEditor((state) => state.undo);
	const redo = useSubtitleEditor((state) => state.redo);
	const { canUndo, canRedo } = useSubtitleUndoState();
	// Edits not exported yet: closing the tab asks first.
	useLeaveGuard(canUndo);
	const doc = useSubtitleDoc();
	const setClockLength = usePlayback((state) => state.setClockLength);
	const [tool, setTool] = useState<ToolId>(initialTool && initialTool !== 'lines' ? initialTool : 'info');
	const projectReady = useProjectReady();
	const ready = opened !== null && projectFile === opened.file && projectReady;
	// Text recognition needs subtitles made of pictures.
	const pictures = useSubtitleProject((state) => state.tracks.some(isPictures));
	const tools: ToolId[] = [
		'info',
		'timing',
		'find',
		// Styles belong to text: not to subtitles made of pictures.
		...(doc.format === 'pgs' ? [] : (['styles'] as const)),
		...(pictures ? (['ocr'] as const) : []),
		'translate',
	];

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

	// Ctrl + F and Ctrl + H open Find, as in Aegisub.
	useEffect(() => {
		if (!ready) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
			if (event.key.toLowerCase() !== 'f' && event.key.toLowerCase() !== 'h') return;
			event.preventDefault();
			setTool('find');
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [ready]);

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
		if (tool === 'find') return <FindPanel />;
		if (tool === 'styles') return <StylesPanel title={opened.file.name.replace(/\.[^.]+$/, '')} />;
		if (tool === 'translate') return <TranslatePanel fileName={opened.file.name} />;
		if (tool === 'ocr') return <OcrPanel fileName={opened.file.name} />;
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
			tools={tools}
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
			// The lines need the room: panels open when a tool is chosen, unless a task page asked for one.
			panelOpenAtStart={initialTool !== undefined && initialTool !== 'lines' && initialTool !== 'info'}
		/>
	);
}
