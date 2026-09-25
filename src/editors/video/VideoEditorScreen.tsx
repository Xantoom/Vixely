import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { cut, isShortened, keptRanges, setTrim } from '@/document/kept';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel, ToolLater } from '@/editor/Inspector';
import { KeptPanel } from '@/editor/KeptPanel';
import { isTyping, useEditorShortcuts } from '@/editor/shortcuts';
import { Timeline } from '@/editor/Timeline';
import { Viewer } from '@/editor/Viewer';
import { EDITORS, type ToolId } from '@/editors/registry';
import { usePlayback } from '@/media/playback';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { MEDIA_ICONS } from '@/ui/icons';
import { AdjustPanel, CropPanel } from '../image/panels';
import { useSubtitleProject } from '../subtitles/project';
import { resolveAudio } from './export';
import { useCopiedRanges, useCopyBlocker, useExportMode, useExportSource, VideoExportPanel } from './ExportPanel';
import { muxContainer } from './mux';
import { MuxFooter } from './MuxPanel';
import { useVideoDoc, useVideoEditor, useVideoPictureEditing, useVideoUndoState } from './store';
import { VideoPreview } from './VideoPreview';
import { VideoTimeline } from './VideoTimeline';

const OPEN_IN = {
	audio: () => m.audio_from_video(),
	gif: () => m.make_gif(),
	subtitles: () => m.subtitles_from_video(),
};

/**
 * Opens the current video in another editor: its soundtrack in the audio one, a GIF in the GIF
 * one, its subtitle tracks in the subtitle one.
 */
function OpenIn({ kind }: { kind: 'audio' | 'gif' | 'subtitles' }) {
	const openAs = useSession((state) => state.openAs);
	const navigate = useNavigate();
	const Icon = MEDIA_ICONS[kind];
	return (
		<Button
			onClick={() => {
				openAs(kind);
				void navigate({ to: EDITORS[kind].path });
			}}
		>
			<Icon size={16} aria-hidden="true" />
			{OPEN_IN[kind]()}
		</Button>
	);
}

/** Arrow keys move playback by this much, in seconds; with Shift, ten times more. */
const ARROW_STEP = 1;

/** Sliders use the arrows, Home and End themselves. */
function isSlider(target: EventTarget | null): boolean {
	return (
		(target instanceof HTMLInputElement && target.type === 'range') ||
		(target instanceof HTMLElement && target.getAttribute('role') === 'slider')
	);
}

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * Space plays and pauses, Delete removes the selection, I and O set where the video starts and
 * ends, the arrows move playback, Home and End jump to the edges of the kept video.
 */
function useVideoShortcuts() {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
			if (isSlider(event.target) && SLIDER_KEYS.has(event.key)) return;
			const state = useVideoEditor.getState();
			const playback = usePlayback.getState();
			const doc = state.history.present;
			const handled = () => {
				event.preventDefault();
			};
			switch (event.key) {
				case ' ':
					// Like in every editor, Space plays even when a button has focus; Enter still presses it.
					handled();
					playback.toggle();
					break;
				case 'Delete':
				case 'Backspace': {
					const { selection } = state;
					if (!selection) return;
					handled();
					state.apply((current) => cut(current, selection));
					state.setSelection(null);
					break;
				}
				case 'i':
				case 'I':
					handled();
					state.apply((current) => setTrim(current, { ...current.trim, start: playback.time }));
					break;
				case 'o':
				case 'O':
					handled();
					state.apply((current) => setTrim(current, { ...current.trim, end: playback.time }));
					break;
				case 'ArrowLeft':
				case 'ArrowRight': {
					handled();
					const step = (event.shiftKey ? 10 : 1) * ARROW_STEP * (event.key === 'ArrowLeft' ? -1 : 1);
					playback.seek(Math.min(doc.duration, Math.max(0, playback.time + step)));
					break;
				}
				case 'Home':
					handled();
					playback.seek(doc.trim.start);
					break;
				case 'End':
					handled();
					playback.seek(doc.trim.end);
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
	}, []);
}

/** The trim panel, bound to the video document and to playback. */
function VideoTrimPanel() {
	const doc = useVideoDoc();
	const apply = useVideoEditor((state) => state.apply);
	const selection = useVideoEditor((state) => state.selection);
	const setSelection = useVideoEditor((state) => state.setSelection);
	const playhead = usePlayback((state) => state.time);
	return (
		<KeptPanel editing={{ doc, apply, playhead, selection, setSelection, lengthLabel: m.video_final_length() }} />
	);
}

/**
 * The video editor: the video plays as edited, its timeline cuts it, and the crop and adjustment
 * tools are the image editor's, applied to every frame.
 */
export function VideoEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const editor = EDITORS.video;
	const current = useSession((state) => state.current);
	const opened = current?.kind === 'video' ? current : null;
	const [tool, setTool] = useState<ToolId>(
		initialTool && (editor.tools.includes(initialTool) || initialTool === 'export') ? initialTool : 'info',
	);
	const openProject = useSubtitleProject((state) => state.open);
	const details = usePlayback((state) => (opened && state.file === opened.file ? state.details : null));
	const load = useVideoEditor((state) => state.load);
	const owner = useVideoEditor((state) => state.owner);
	const doc = useVideoDoc();
	const undo = useVideoEditor((state) => state.undo);
	const redo = useVideoEditor((state) => state.redo);
	const { canUndo, canRedo } = useVideoUndoState();
	const blocker = useCopyBlocker();
	const mode = useExportMode();
	const exportSettings = useVideoEditor((state) => state.exportSettings);
	const exportSource = useVideoEditor((state) => state.exportSource);
	const upright = details?.video ?? { width: 16, height: 9 };
	const editing = useVideoPictureEditing(upright);
	const playable = Boolean(opened?.info?.video?.decodable);
	const ready = opened !== null && owner === opened.file && details !== null;

	// The subtitle tracks are read with the video, like a player lists them; the subtitle editor
	// then finds them, and its edits come back here. Opening them also loads the player.
	useEffect(() => {
		if (opened) openProject({ ...opened, kind: 'subtitles' });
	}, [opened, openProject]);

	useEffect(() => {
		if (opened && details) load(opened.file, details.duration);
	}, [opened, details, load]);

	// Playback skips what the timeline removed; other editors play the whole file.
	const { trim, cuts } = doc;
	useEffect(() => {
		if (!ready) return;
		usePlayback.getState().setRanges(isShortened(doc) ? keptRanges(doc) : null);
		// Only the kept ranges matter here, not the picture.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [ready, trim, cuts]);
	useEffect(
		() => () => {
			usePlayback.getState().setRanges(null);
		},
		[],
	);

	useExportSource(ready ? opened : null, details?.video ?? null);
	useCopiedRanges(ready ? opened.file : null, tool === 'export');
	useVideoShortcuts();
	useEditorShortcuts({ undo, redo });

	const inspector = () => {
		if (opened && tool === 'export') {
			return ready ? (
				<VideoExportPanel opened={opened} upright={upright} />
			) : (
				<ToolLater kind="video" tool={tool} />
			);
		}
		if (tool === 'info' || !opened) {
			return (
				<>
					<FilePanel opened={opened} />
					{opened && (
						<div className="grid gap-2">
							{playable && <OpenIn kind="gif" />}
							{opened.info?.audio && <OpenIn kind="audio" />}
							<OpenIn kind="subtitles" />
						</div>
					)}
				</>
			);
		}
		if (!ready) return <ToolLater kind="video" tool={tool} />;
		if (tool === 'trim') return <VideoTrimPanel />;
		if (tool === 'crop') return <CropPanel editing={editing} />;
		if (tool === 'adjust') return <AdjustPanel editing={editing} />;
		return <ToolLater kind="video" tool={tool} />;
	};

	return (
		<EditorLayout
			kind="video"
			fileName={opened?.file.name}
			tool={tool}
			onTool={setTool}
			actions={
				opened
					? {
							canUndo,
							canRedo,
							onUndo: undo,
							onRedo: redo,
							onExport: () => {
								setTool('export');
							},
							exportActive: tool === 'export',
						}
					: undefined
			}
			viewer={
				opened && playable ? (
					<VideoPreview opened={opened} editing={editing} cropping={tool === 'crop'} />
				) : (
					<Viewer kind="video" opened={opened} />
				)
			}
			timeline={
				opened && ready ? (
					<VideoTimeline
						file={opened.file}
						aspect={upright.width / upright.height}
						audio={Boolean(opened.info?.audio)}
					/>
				) : opened ? (
					<Timeline file={opened.file} info={opened.info} poster={opened.poster} />
				) : undefined
			}
			inspector={inspector()}
			inspectorFooter={
				opened && tool === 'export' ? (
					<MuxFooter
						opened={opened}
						blocked={mode === 'copy' ? blocker !== null : !exportSettings || !exportSource}
						convert={
							exportSettings && exportSource
								? {
										settings:
											mode === 'encode'
												? {
														...exportSettings,
														audio: resolveAudio(
															exportSettings,
															exportSource.source,
															doc.cuts.length > 0,
														),
													}
												: {
														...exportSettings,
														mode: 'copy',
														container: muxContainer(opened.format),
													},
										doc,
										upright,
									}
								: null
						}
					/>
				) : undefined
			}
		/>
	);
}
