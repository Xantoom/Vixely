import { TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDropHandler } from '@/app/GlobalDrop';
import { useLeaveGuard } from '@/app/leave-guard';
import { type ItemStatus, BatchList } from '@/editor/BatchList';
import { EditorLayout } from '@/editor/EditorLayout';
import { ToolLater } from '@/editor/Inspector';
import { LayersPanel } from '@/editor/overlays/panels';
import { isTyping, useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import { overlayEditing } from '@/editors/image/editing';
import { AdjustPanel, CropPanel } from '@/editors/image/panels';
import type { ToolId } from '@/editors/registry';
import { useOpened, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Alert } from '@/ui/Alert';
import { Button } from '@/ui/Button';
import { frameAt } from './document';
import { type GifEngine, useGifEngine } from './engine';
import { FramesPanel } from './FramesPanel';
import { GifTimeline } from './GifTimeline';
import { GifStatus, GifViewer, useGifAspect } from './GifViewer';
import { BandsSection, ExportFooter, ExportPanel, GifInfoPanel, SpeedPanel, TrimPanel } from './panels';
import { GifResizePanel } from './ResizePanel';
import { LONG_GIF, useGifEditor, useGifPictureEditing, useGifUndoState } from './store';

/**
 * Space plays and pauses, like everywhere else (Enter still presses a focused button); the arrows
 * step one frame (ten with Shift), Home and End go to the first and last frame.
 */
function useGifShortcuts(engine: GifEngine) {
	const { togglePlay, frames, seek } = engine;
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
			// A focused trim handle moves with the arrows itself.
			const slider = event.target instanceof HTMLElement && event.target.getAttribute('role') === 'slider';
			if (slider && event.key !== ' ') return;
			const shown = frameAt(frames, useGifEditor.getState().playhead);
			const index = shown ? frames.indexOf(shown) : 0;
			const go = (to: number) => {
				const frame = frames[Math.min(frames.length - 1, Math.max(0, to))];
				if (frame) seek(frame.start);
			};
			switch (event.key) {
				case ' ':
					togglePlay();
					break;
				case 'ArrowLeft':
				case 'ArrowRight':
					go(index + (event.shiftKey ? 10 : 1) * (event.key === 'ArrowLeft' ? -1 : 1));
					break;
				case 'Home':
					go(0);
					break;
				case 'End':
					go(frames.length - 1);
					break;
				default:
					return;
			}
			event.preventDefault();
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
	}, [togglePlay, frames, seek]);
}

/**
 * The first picture, for the looks' thumbnails: an animation's first frame, or a video's poster.
 */
function useFirstPicture(engine: GifEngine, poster: ImageBitmap | null): ImageBitmap | null {
	const { source } = engine;
	if (!source) return null;
	if (!source.timing) return poster;
	const first = source.peek(source.timing[0]?.start ?? 0);
	return first instanceof ImageBitmap ? first : poster;
}

export function GifEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const opened = useOpened('gif');
	const undo = useGifEditor((state) => state.undo);
	const redo = useGifEditor((state) => state.redo);
	const { canUndo, canRedo } = useGifUndoState();
	// Edits not exported yet: closing the tab asks first.
	useLeaveGuard(canUndo);
	// A batch of GIFs shares its export settings; cutting and cropping belong to one file.
	const batch = useSession((state) => (state.batchKind === 'gif' ? state.batch : null));
	const batchKey = useSession((state) => (state.batchKind === 'gif' ? state.batchKey : null));
	const [statuses, setStatuses] = useState<ReadonlyMap<number, ItemStatus>>(new Map());
	const [running, setRunning] = useState(false);
	const [chosenTool, setTool] = useState<ToolId>(initialTool ?? 'info');
	const tool = batch && chosenTool !== 'export' ? 'info' : chosenTool;
	const engine = useGifEngine(opened, batchKey);
	const aspect = useGifAspect(engine, tool === 'crop');
	const { source } = engine;
	// Only a GIF file can keep its frames: not a video, an APNG or a WebP.
	const isGif = opened?.format === 'gif' && !opened.info?.video;
	const textRef = useRef<HTMLTextAreaElement>(null);
	const still = useFirstPicture(engine, opened?.poster ?? null);
	const editing = useGifPictureEditing({ width: source?.width ?? 1, height: source?.height ?? 1 }, still);

	useEditorShortcuts({ undo, redo });
	useGifShortcuts(engine);

	// An animation made from images opens on its frames, and takes more images dropped on it.
	const fromImages = Boolean(opened?.images);
	const lead = opened?.file ?? null;
	useEffect(() => {
		if (fromImages && (initialTool ?? 'info') === 'info') setTool('frames');
	}, [lead, fromImages, initialTool]);
	const addImages = useSession((state) => state.addImages);
	useDropHandler(async (files) => {
		if (!fromImages) return false;
		return addImages(files);
	});

	const inspector = () => {
		if (tool === 'info' || !source) return <GifInfoPanel engine={engine} opened={opened} />;
		if (tool === 'trim') return <TrimPanel engine={engine} />;
		if (tool === 'crop')
			return (
				<>
					<CropPanel editing={editing} />
					<BandsSection width={source.width} height={source.height} />
				</>
			);
		if (tool === 'resize') return <GifResizePanel source={source} />;
		if (tool === 'adjust') return <AdjustPanel editing={editing} />;
		if (tool === 'layers') return <LayersPanel editing={overlayEditing(editing)} textRef={textRef} />;
		if (tool === 'speed') return <SpeedPanel animated={source.timing !== null} />;
		if (tool === 'frames') return <FramesPanel engine={engine} fileName={opened?.file.name ?? 'animation'} />;
		if (tool === 'export') return <ExportPanel engine={engine} isGif={isGif} />;
		return <ToolLater kind="gif" tool={tool} />;
	};

	const viewer = () => {
		if (source)
			return (
				<GifViewer
					engine={engine}
					cropping={tool === 'crop'}
					overlays={tool === 'layers' ? overlayEditing(editing) : undefined}
					onEditText={() => {
						setTool('layers');
						requestAnimationFrame(() => {
							textRef.current?.focus();
						});
					}}
				/>
			);
		if (engine.failed) return <p className="text-body text-danger">{m.gif_failed()}</p>;
		if (engine.reading !== null && engine.reading > 0) {
			return <p className="text-body text-muted">{m.gif_reading({ count: engine.reading })}</p>;
		}
		return <Viewer kind="gif" opened={opened} />;
	};

	return (
		<>
			{source && opened?.info?.video && source.duration > LONG_GIF && <LongVideoAlert file={opened.file} />}
			<EditorLayout
				kind="gif"
				ambient={opened?.poster ?? null}
				fileName={batch ? undefined : opened?.file.name}
				tool={tool}
				onTool={setTool}
				tools={batch ? ['info'] : undefined}
				actions={{
					canUndo,
					canRedo,
					onUndo: undo,
					onRedo: redo,
					onExport: source
						? () => {
								setTool('export');
							}
						: undefined,
					exportActive: tool === 'export',
				}}
				viewer={viewer()}
				status={source && !batch ? <GifStatus engine={engine} /> : undefined}
				aspect={batch ? undefined : aspect}
				timeline={
					source ? (
						<>
							{batch && (
								<BatchList
									statuses={statuses}
									locked={running}
									count={(count) => m.batch_count_gif({ count })}
									addLabel={m.batch_add_audio()}
									accept="image/gif,image/png,image/webp,.gif,.apng,.webp"
								/>
							)}
							{!batch && <GifTimeline engine={engine} />}
						</>
					) : undefined
				}
				inspector={inspector()}
				inspectorFooter={
					tool === 'export' && source && opened ? (
						<ExportFooter
							engine={engine}
							file={opened.file}
							isGif={isGif}
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
		</>
	);
}

/** Videos warned about already: coming back to one doesn't warn again. */
const warned = new WeakSet<File>();

/**
 * A video over a minute long, opened to make a GIF: warned once that the GIF will weigh a lot
 * and play with difficulty, so the passage kept is best chosen first.
 */
function LongVideoAlert({ file }: { file: File }) {
	const [open, setOpen] = useState(() => !warned.has(file));
	if (!open) return null;
	const close = () => {
		warned.add(file);
		setOpen(false);
	};
	return (
		<Alert
			title={m.gif_long_title()}
			media="gif"
			icon={<TriangleAlert className="text-ed-text size-5" aria-hidden="true" />}
			onClose={close}
			actions={
				<Button variant="primary" onClick={close}>
					{m.gif_long_ok()}
				</Button>
			}
		>
			{m.gif_long_body()}
		</Alert>
	);
}
