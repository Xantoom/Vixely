import { useEffect, useState } from 'react';
import { type ItemStatus, BatchList } from '@/editor/BatchList';
import { EditorLayout } from '@/editor/EditorLayout';
import { FilePanel, ToolLater } from '@/editor/Inspector';
import { isTyping, useEditorShortcuts } from '@/editor/shortcuts';
import { Viewer } from '@/editor/Viewer';
import type { ToolId } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { frameAt } from './document';
import { type GifEngine, useGifEngine } from './engine';
import { GifTimeline } from './GifTimeline';
import { GifViewer } from './GifViewer';
import { CropPanel, ExportFooter, ExportPanel, SpeedPanel, TrimPanel } from './panels';
import { useGifEditor, useGifUndoState } from './store';

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

export function GifEditorScreen({ initialTool }: { initialTool?: ToolId }) {
	const current = useSession((state) => state.current);
	const opened = current?.kind === 'gif' ? current : null;
	const undo = useGifEditor((state) => state.undo);
	const redo = useGifEditor((state) => state.redo);
	const { canUndo, canRedo } = useGifUndoState();
	// A batch of GIFs shares its export settings; cutting and cropping belong to one file.
	const batch = useSession((state) => (state.batchKind === 'gif' ? state.batch : null));
	const batchKey = useSession((state) => (state.batchKind === 'gif' ? state.batchKey : null));
	const [statuses, setStatuses] = useState<ReadonlyMap<number, ItemStatus>>(new Map());
	const [running, setRunning] = useState(false);
	const [chosenTool, setTool] = useState<ToolId>(initialTool ?? 'info');
	const tool = batch && chosenTool !== 'export' ? 'info' : chosenTool;
	const engine = useGifEngine(opened, batchKey);
	const { source } = engine;
	// Only a GIF file can keep its frames: not a video, an APNG or a WebP.
	const isGif = opened?.format === 'gif' && !opened.info?.video;

	useEditorShortcuts({ undo, redo });
	useGifShortcuts(engine);

	const inspector = () => {
		if (tool === 'info' || !source) return <FilePanel opened={opened} />;
		if (tool === 'trim') return <TrimPanel engine={engine} />;
		if (tool === 'crop') return <CropPanel width={source.width} height={source.height} />;
		if (tool === 'speed') return <SpeedPanel animated={source.timing !== null} />;
		if (tool === 'export') return <ExportPanel engine={engine} isGif={isGif} />;
		return <ToolLater kind="gif" tool={tool} />;
	};

	const viewer = () => {
		if (source) return <GifViewer engine={engine} cropping={tool === 'crop'} />;
		if (engine.failed) return <p className="text-body text-danger">{m.gif_failed()}</p>;
		if (engine.reading !== null && engine.reading > 0) {
			return <p className="text-body text-muted">{m.gif_reading({ count: engine.reading })}</p>;
		}
		return <Viewer kind="gif" opened={opened} />;
	};

	return (
		<EditorLayout
			kind="gif"
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
	);
}
