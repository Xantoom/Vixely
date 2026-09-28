import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Download, ImagePlus, ImageUp, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { saveFile } from '@/editors/image/export';
import { EDITORS } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { NumberField } from '@/ui/fields';
import { FrameComposer } from './compose';
import { frameAt, frameKey, frameLayout, keptKeys, moveFrame, type OutputFrame, setFrameDelays } from './document';
import type { GifEngine } from './engine';
import { useGifDoc, useGifEditor } from './store';

/** Side of a frame's thumbnail, in CSS pixels. */
const THUMB = 88;

/** The frame at `index` as a PNG, at the full size of the output. */
async function framePng(engine: GifEngine, frame: OutputFrame, index: number, name: string): Promise<File | null> {
	const { source } = engine;
	if (!source) return null;
	const doc = useGifEditor.getState().history.present;
	const layout = frameLayout(doc, source, null);
	const picture = await source.fetch(frame.source);
	if (!(picture instanceof ImageBitmap || picture instanceof OffscreenCanvas || picture instanceof HTMLCanvasElement))
		return null;
	// A video's preview pictures are small: the frame is read again at full size for the file.
	let full: TexImageSource = picture;
	if (!source.timing) {
		for await (const read of source.render([frame.source], 1)) {
			full = read;
			break;
		}
	}
	const canvas = new OffscreenCanvas(layout.width, layout.height);
	const context = canvas.getContext('2d');
	if (!context) return null;
	const composer = new FrameComposer();
	composer.draw(context, full, source, doc, layout, { time: frame.start, length: engine.length });
	composer.dispose();
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	const base = name.replace(/\.[^.]+$/, '');
	return new File([blob], `${base} frame ${index + 1}.png`, { type: 'image/png', lastModified: Date.now() });
}

/** One frame's thumbnail, drawn when it scrolls into view. */
function Thumbnail({
	engine,
	frame,
	composer,
}: {
	engine: GifEngine;
	frame: OutputFrame;
	composer: FrameComposer | null;
}) {
	const doc = useGifDoc();
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		const { source } = engine;
		if (!canvas || !source || !composer) return;
		let live = true;
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			void source.fetch(frame.source).then((picture) => {
				const context = canvas.getContext('2d');
				if (!live || !context || !picture) return;
				if (
					!(
						picture instanceof ImageBitmap ||
						picture instanceof HTMLCanvasElement ||
						picture instanceof OffscreenCanvas
					)
				)
					return;
				const layout = frameLayout(doc, source, null);
				const ratio = window.devicePixelRatio || 1;
				const scale = Math.min(THUMB / layout.width, THUMB / layout.height);
				canvas.width = Math.max(1, Math.round(layout.width * scale * ratio));
				canvas.height = Math.max(1, Math.round(layout.height * scale * ratio));
				composer.draw(context, picture, source, doc, layout, { time: frame.start, length: engine.length });
			});
		});
		observer.observe(canvas);
		return () => {
			live = false;
			observer.disconnect();
		};
	}, [engine, frame, composer, doc]);
	return <canvas ref={ref} className="max-h-full max-w-full rounded-[3px]" />;
}

/** Shortest frame delay browsers play as asked, in milliseconds; and the longest offered. */
const DELAY_RANGE = { min: 20, max: 60_000 };

/**
 * Every frame of the output, to look at one by one: go to it, leave it out, move it, set how long
 * it shows, save it as a PNG or open it in the image editor. An animation made from images takes
 * more images here.
 */
export function FramesPanel({ engine, fileName }: { engine: GifEngine; fileName: string }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const setPlaying = useGifEditor((state) => state.setPlaying);
	const open = useSession((state) => state.open);
	const addImages = useSession((state) => state.addImages);
	const navigate = useNavigate();
	const [composer, setComposer] = useState<FrameComposer | null>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const pickerRef = useRef<HTMLInputElement>(null);
	// The frame being moved: it stays selected once the frames are laid out again.
	const following = useRef<number | null>(null);
	const dragged = useRef<number | null>(null);
	const { frames, source } = engine;
	const timing = source?.timing ?? null;
	// Only a new frame draws again, not every moment of playback.
	const current = useGifEditor((state) => frameAt(frames, state.playhead));
	const index = current ? frames.indexOf(current) : -1;
	// Frames of their own, as in a GIF or images: they can be moved and timed one by one.
	const ownFrames = timing !== null && doc.fps === null;
	const keys = ownFrames ? keptKeys(doc, timing) : [];
	const key = current ? frameKey(current.source) : null;
	const position = key === null ? -1 : keys.indexOf(key);
	// Earlier on screen is later in the source when the animation plays backwards.
	const step = doc.direction === 'reverse' ? -1 : 1;

	// Made once mounted, so a panel mounted twice (as React does in development) draws with a live one.
	useEffect(() => {
		let made: FrameComposer | null = null;
		try {
			made = new FrameComposer();
		} catch {
			// Thumbnails stay blank without WebGL.
		}
		setComposer(made);
		return () => {
			made?.dispose();
			setComposer(null);
		};
	}, []);

	useEffect(() => {
		const moved = following.current;
		if (moved === null) return;
		following.current = null;
		const frame = frames.find((candidate) => frameKey(candidate.source) === moved);
		if (frame) engine.seek(frame.start);
	}, [frames, engine]);

	// The focus follows the frame shown, whether chosen here or stepped to with the arrows.
	useEffect(() => {
		const list = listRef.current;
		if (!list?.contains(document.activeElement)) return;
		list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
	}, [index]);

	const remove = () => {
		if (!current || frames.length <= 1) return;
		const removed = frameKey(current.source);
		apply((doc) => ({ ...doc, removed: [...doc.removed, removed] }));
	};

	const move = (moved: number, to: number) => {
		setPlaying(false);
		following.current = moved;
		apply((doc) => moveFrame(doc, timing, moved, to));
	};

	return (
		<>
			<PanelTitle>{m.tool_frames()}</PanelTitle>
			{(Boolean(source?.addImages) || doc.removed.length > 0) && (
				<div className="flex flex-wrap gap-2">
					{source?.addImages && (
						<>
							<Button
								onClick={() => {
									pickerRef.current?.click();
								}}
							>
								<ImagePlus className="size-4.5" aria-hidden="true" />
								{m.frames_add()}
							</Button>
							<input
								ref={pickerRef}
								type="file"
								accept="image/*"
								multiple
								hidden
								onChange={(event) => {
									const files = [...(event.target.files ?? [])];
									event.target.value = '';
									if (files.length > 0) void addImages(files);
								}}
							/>
						</>
					)}
					{doc.removed.length > 0 && (
						<Button
							onClick={() => {
								apply((doc) => ({ ...doc, removed: [] }));
							}}
						>
							<Undo2 className="size-4.5" aria-hidden="true" />
							{m.frames_restore({ count: doc.removed.length })}
						</Button>
					)}
				</div>
			)}
			{current && (
				<Section title={m.frame_number({ number: index + 1 })}>
					{ownFrames && key !== null && (
						<div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
							<label className="grid gap-1.5">
								<span className="text-ui text-ink-2">{m.frame_duration()}</span>
								<NumberField
									value={Math.round(current.duration * 1000)}
									unit="ms"
									min={DELAY_RANGE.min}
									max={DELAY_RANGE.max}
									onCommit={(milliseconds) => {
										apply((doc) => setFrameDelays(doc, [key], milliseconds / 1000));
									}}
								/>
							</label>
							<Button
								onClick={() => {
									apply((doc) => setFrameDelays(doc, keptKeys(doc, timing), current.duration));
								}}
							>
								{m.frame_duration_all()}
							</Button>
						</div>
					)}
					<div className="flex flex-wrap gap-1">
						{ownFrames && key !== null && (
							<>
								<IconButton
									label={m.frame_earlier()}
									disabled={position < 0 || position - step < 0 || position - step >= keys.length}
									onClick={() => {
										move(key, position - step);
									}}
								>
									<ArrowLeft className="size-5" />
								</IconButton>
								<IconButton
									label={m.frame_later()}
									disabled={position < 0 || position + step < 0 || position + step >= keys.length}
									onClick={() => {
										move(key, position + step);
									}}
								>
									<ArrowRight className="size-5" />
								</IconButton>
							</>
						)}
						<IconButton label={m.frame_delete()} onClick={remove} disabled={frames.length <= 1}>
							<Trash2 className="size-5" />
						</IconButton>
						<IconButton
							label={m.frame_save()}
							onClick={() => {
								void framePng(engine, current, index, fileName).then(async (file) => {
									if (file) await saveFile(file, file.name);
								});
							}}
						>
							<Download className="size-5" />
						</IconButton>
						<IconButton
							label={m.frame_edit()}
							onClick={() => {
								setPlaying(false);
								void framePng(engine, current, index, fileName).then(async (file) => {
									if (!file) return;
									const kind = await open([file], 'image');
									if (kind) await navigate({ to: EDITORS[kind].path });
								});
							}}
						>
							<ImageUp className="size-5" />
						</IconButton>
					</div>
				</Section>
			)}
			<div
				ref={listRef}
				role="listbox"
				aria-label={m.tool_frames()}
				className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2"
				onKeyDown={(event) => {
					// Alt and the arrows move the frame shown; the arrows alone step through them.
					if (!event.altKey || !ownFrames || key === null || position < 0) return;
					const delta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
					if (delta === 0) return;
					event.preventDefault();
					const to = position + delta;
					if (to >= 0 && to < keys.length) move(key, to);
				}}
			>
				{frames.map((frame, shown) => {
					const frameKeyed = frameKey(frame.source);
					// A frame played twice (back and forth) has a button for each time.
					const repeat = frames.slice(0, shown).filter((before) => before.source === frame.source).length;
					return (
						<button
							key={`${frameKeyed}-${repeat}`}
							type="button"
							role="option"
							aria-selected={shown === index}
							aria-label={m.frame_number({ number: shown + 1 })}
							tabIndex={shown === index || (index < 0 && shown === 0) ? 0 : -1}
							draggable={ownFrames}
							onDragStart={(event) => {
								dragged.current = frameKeyed;
								event.dataTransfer.effectAllowed = 'move';
							}}
							onDragOver={(event) => {
								if (dragged.current !== null) event.preventDefault();
							}}
							onDrop={(event) => {
								const moved = dragged.current;
								dragged.current = null;
								if (moved === null || moved === frameKeyed) return;
								event.preventDefault();
								move(moved, keys.indexOf(frameKeyed));
							}}
							onDragEnd={() => {
								dragged.current = null;
							}}
							onClick={() => {
								setPlaying(false);
								engine.seek(frame.start);
							}}
							className="bg-surface aria-selected:bg-ed-soft aria-selected:shadow-[inset_0_0_0_1.5px_var(--ed)] grid gap-1 rounded-sm p-1.5 text-left transition-colors"
						>
							<span className="grid h-[5.5rem] place-items-center">
								<Thumbnail engine={engine} frame={frame} composer={composer} />
							</span>
							<span className="text-caption text-muted tabular flex justify-between font-mono">
								<span>{shown + 1}</span>
								<span>{Math.round(frame.duration * 1000)} ms</span>
							</span>
						</button>
					);
				})}
			</div>
		</>
	);
}
