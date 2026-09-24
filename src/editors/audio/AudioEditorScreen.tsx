import { useEffect, useState } from 'react';
import { BatchList } from '@/editor/BatchList';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel, ToolLater } from '@/editor/Inspector';
import { useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { AudioTimeline } from './AudioTimeline';
import type { ItemStatus } from './batch-export';
import { cut, setTrim } from './document';
import { type AudioEngine, useAudioEngine } from './engine';
import { readSourceFormat, type SourceFormat } from './export';
import { ExportFooter, ExportPanel } from './ExportPanel';
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
function useAudioShortcuts(engine: AudioEngine, trimmable: boolean) {
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
					if (!state.selection || !trimmable) return;
					handled();
					state.apply((current) => (state.selection ? cut(current, state.selection) : current));
					state.setSelection(null);
					break;
				case 'i':
				case 'I':
					if (!trimmable) return;
					handled();
					state.apply((current) => setTrim(current, { ...current.trim, start: state.playhead }));
					break;
				case 'o':
				case 'O':
					if (!trimmable) return;
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
	}, [engine, trimmable]);
}

/** Codec, bitrate and layout of the file's audio, read in the background once it opens. */
function useSourceFormat(file: File | null, track: number | null): SourceFormat | null {
	const [format, setFormat] = useState<{ file: File; track: number | null; format: SourceFormat | null } | null>(
		null,
	);
	useEffect(() => {
		if (!file) return;
		let active = true;
		void readSourceFormat(file, track).then((result) => {
			if (active) setFormat({ file, track, format: result });
		});
		return () => {
			active = false;
		};
	}, [file, track]);
	return format && format.file === file && format.track === track ? format.format : null;
}

export function AudioEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	const opened = current?.kind === 'audio' ? current : null;
	const duration = opened?.info?.duration ?? 0;
	const editable = opened !== null && duration > 0 && opened.info?.audio !== null;
	// A batch of images belongs to the image editor.
	const batch = useSession((state) => (state.batchKind === 'audio' ? state.batch : null));
	const batchKey = useSession((state) => (state.batchKind === 'audio' ? state.batchKey : null));
	const load = useAudioEditor((state) => state.load);
	const retarget = useAudioEditor((state) => state.retarget);
	const [statuses, setStatuses] = useState<ReadonlyMap<number, ItemStatus>>(new Map());
	const [running, setRunning] = useState(false);
	const undo = useAudioEditor((state) => state.undo);
	const redo = useAudioEditor((state) => state.redo);
	const { canUndo, canRedo } = useAudioUndoState();
	const [chosenTool, setTool] = useState<ToolId>(initialTool ?? 'info');
	// Cutting belongs to one file: a batch shares volume, fades and export settings only.
	const tools: ToolId[] | undefined = batch ? ['info', 'volume'] : undefined;
	const tool = batch && chosenTool === 'trim' ? 'info' : chosenTool;
	const audioTrack = useAudioEditor((state) => state.audioTrack);
	const engine = useAudioEngine(editable ? opened.file : null, duration, audioTrack);
	const sourceFormat = useSourceFormat(editable ? opened.file : null, audioTrack);
	const adoptSource = useAudioEditor((state) => state.adoptSource);

	useEffect(() => {
		if (!opened || !editable) return;
		const tags = opened.info?.tags;
		// A batch keeps one set of edits across its files, moved to each file's length.
		load(batchKey ?? opened.file, duration, {
			title: tags?.title ?? '',
			artist: tags?.artist ?? '',
			album: tags?.album ?? '',
		});
		retarget(duration);
	}, [opened, editable, duration, batchKey, load, retarget]);

	// Once the source is read, export settings start from it: same format, bitrate and rate.
	useEffect(() => {
		if (sourceFormat) adoptSource(sourceFormat);
	}, [sourceFormat, adoptSource]);

	useEditorShortcuts({ undo, redo });
	useAudioShortcuts(engine, !batch);

	const inspector = () => {
		if (tool === 'info' || !editable) return <FilePanel opened={opened} />;
		if (tool === 'trim') return <TrimPanel />;
		if (tool === 'volume') return <VolumePanel engine={engine} />;
		if (tool === 'export' && sourceFormat)
			return (
				<ExportPanel
					source={sourceFormat}
					doc={engine.resolved}
					cover={opened?.poster ?? null}
					batch={batch !== null}
				/>
			);
		return <ToolLater kind="audio" tool={tool} />;
	};

	return (
		<EditorLayout
			kind="audio"
			fileName={batch ? undefined : opened?.file.name}
			tool={tool}
			onTool={setTool}
			tools={tools}
			actions={{
				canUndo,
				canRedo,
				onUndo: undo,
				onRedo: redo,
				onExport:
					editable && sourceFormat
						? () => {
								setTool('export');
							}
						: undefined,
				exportActive: tool === 'export',
			}}
			viewer={<Viewer kind="audio" opened={opened} />}
			timeline={
				editable ? (
					<>
						{batch && (
							<BatchList
								statuses={statuses}
								locked={running}
								count={(count) => m.batch_count_audio({ count })}
								addLabel={m.batch_add_audio()}
								accept="audio/*,video/*,.mka,.mkv,.opus,.flac"
							/>
						)}
						<AudioTimeline engine={engine} trimmable={!batch} />
					</>
				) : undefined
			}
			inspector={inspector()}
			inspectorFooter={
				tool === 'export' && editable && sourceFormat ? (
					<ExportFooter
						file={opened.file}
						source={sourceFormat}
						doc={engine.resolved}
						ready={batch !== null || engine.resolved.normalize === null || engine.reading !== null}
						batch={batch}
						onRunning={setRunning}
						onStatus={(id, status) => {
							setStatuses((previous) => {
								const next = new Map(previous);
								if (status) next.set(id, status);
								else next.delete(id);
								return next;
							});
						}}
					/>
				) : undefined
			}
		/>
	);
}
