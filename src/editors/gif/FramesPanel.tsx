import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Copy, Download, ImagePlus, ImageUp, ListChecks, Trash2, Undo2 } from 'lucide-react';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { saveFile } from '@/editors/image/export';
import { EDITORS } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { NumberField } from '@/ui/fields';
import { FrameComposer } from './compose';
import {
	duplicateFrames,
	frameAt,
	frameLayout,
	keptKeys,
	moveFrames,
	type OutputFrame,
	setFrameDelays,
} from './document';
import type { GifEngine } from './engine';
import { useGifDoc, useGifEditor } from './store';

/** A row doing something with the frame shown, named in full. */
const FRAME_ACTION =
	'text-ui text-ink-2 hover:bg-surface hover:text-ink -mx-2 flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left font-medium transition-colors';

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
	return <canvas ref={ref} className="bg-surface-2 block h-auto w-full rounded-xs" />;
}

/** Shortest frame delay browsers play as asked, in milliseconds; and the longest offered. */
const DELAY_RANGE = { min: 20, max: 60_000 };

/**
 * Every frame of the output, to look at one by one or several at once: go to it, leave it out,
 * copy it, move it, set how long it shows, save it as a PNG or open it in the image editor.
 * Animations held in memory take more images here, after the frame chosen.
 */
export function FramesPanel({ engine, fileName }: { engine: GifEngine; fileName: string }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const setPlaying = useGifEditor((state) => state.setPlaying);
	const open = useSession((state) => state.open);
	const navigate = useNavigate();
	const [composer, setComposer] = useState<FrameComposer | null>(null);
	// Frames chosen besides the one shown, by key; one or none means the frame shown alone.
	const [selected, setSelected] = useState<number[]>([]);
	// Taps add to the selection rather than replace it: several frames chosen without a keyboard.
	const [picking, setPicking] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);
	const pickerRef = useRef<HTMLInputElement>(null);
	// Where a Shift-click range starts.
	const anchor = useRef<number | null>(null);
	// The frame being moved: it stays shown once the frames are laid out again.
	const following = useRef<number | null>(null);
	const dragged = useRef<number | null>(null);
	const { frames, source } = engine;
	const timing = source?.timing ?? null;
	// Only a new frame draws again, not every moment of playback.
	const current = useGifEditor((state) => frameAt(frames, state.playhead));
	const index = current ? frames.indexOf(current) : -1;
	// Frames of their own, as in a GIF or images: they can be moved, copied and timed one by one.
	const ownFrames = timing !== null && doc.fps === null;
	const keys = ownFrames ? keptKeys(doc, timing) : [...new Set(frames.map((frame) => frame.key))];
	const key = current?.key ?? null;
	// The frames acted on, in play order before the direction: those chosen, or the one shown.
	const live = selected.filter((candidate) => keys.includes(candidate));
	const chosen = live.length > 1 ? keys.filter((candidate) => live.includes(candidate)) : key === null ? [] : [key];
	const several = chosen.length > 1;
	const positions = chosen.map((candidate) => keys.indexOf(candidate));
	const first = Math.min(...positions);
	const last = Math.max(...positions);
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
		const frame = frames.find((candidate) => candidate.key === moved);
		if (frame) engine.seek(frame.start);
	}, [frames, engine]);

	// The focus follows the frame shown, whether chosen here or stepped to with the arrows.
	useEffect(() => {
		const list = listRef.current;
		if (!list?.contains(document.activeElement)) return;
		list.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
	}, [index]);

	const show = (shown: number) => {
		following.current = shown;
		const frame = frames.find((candidate) => candidate.key === shown);
		if (frame) engine.seek(frame.start);
	};

	const remove = () => {
		if (chosen.length === 0 || chosen.length >= keys.length) return;
		const gone = new Set(chosen);
		// The frame shown next is the first one left after those removed.
		const next =
			keys.slice(last + 1).find((candidate) => !gone.has(candidate)) ??
			keys.findLast((candidate) => !gone.has(candidate));
		apply((doc) => ({ ...doc, removed: [...doc.removed, ...chosen] }));
		setSelected([]);
		if (next !== undefined) show(next);
	};

	const duplicate = () => {
		if (!ownFrames || chosen.length === 0) return;
		setPlaying(false);
		let copies: number[] = [];
		apply((doc) => {
			const result = duplicateFrames(doc, timing, chosen);
			copies = result.copies;
			return result.doc;
		});
		// The copies are chosen, so copying again copies them.
		setSelected(copies.length > 1 ? copies : []);
		const [shown] = copies;
		if (shown !== undefined) following.current = shown;
	};

	/** The frames chosen moved `delta` places, forward, together. */
	const shift = (delta: number) => {
		if (!ownFrames || chosen.length === 0) return;
		const gone = new Set(chosen);
		const before = keys.slice(0, first).filter((candidate) => !gone.has(candidate)).length;
		const lastBefore = keys.slice(0, last).filter((candidate) => !gone.has(candidate)).length;
		move(chosen, delta < 0 ? before - 1 : lastBefore + 1);
	};
	const rest = keys.length - chosen.length;
	const restBefore = keys.slice(0, first).filter((candidate) => !chosen.includes(candidate)).length;
	const restAfter = keys.slice(last + 1).length;
	const canShift = (delta: number) =>
		ownFrames && chosen.length > 0 && rest > 0 && (delta < 0 ? restBefore > 0 : restAfter > 0);

	const move = (moved: number[], to: number) => {
		setPlaying(false);
		following.current = key !== null && moved.includes(key) ? key : (moved[0] ?? null);
		apply((doc) => moveFrames(doc, timing, moved, to));
	};

	const pick = (frame: OutputFrame, event: MouseEvent) => {
		setPlaying(false);
		const toggle = picking || event.ctrlKey || event.metaKey;
		if (event.shiftKey) {
			const from = keys.indexOf(anchor.current ?? key ?? frame.key);
			const to = keys.indexOf(frame.key);
			if (from >= 0 && to >= 0) {
				setSelected(keys.slice(Math.min(from, to), Math.max(from, to) + 1));
				engine.seek(frame.start);
				return;
			}
		}
		anchor.current = frame.key;
		if (toggle) {
			const base = live.length > 1 ? live : key === null ? [] : [key];
			const next = base.includes(frame.key)
				? base.filter((candidate) => candidate !== frame.key)
				: [...base, frame.key];
			setSelected(next);
			// The frame shown stays among those chosen.
			const shown = next.includes(frame.key) ? frame : frames.find((candidate) => candidate.key === next.at(-1));
			if (shown) engine.seek(shown.start);
			return;
		}
		setSelected([]);
		engine.seek(frame.start);
	};

	return (
		<>
			<PanelTitle>{m.tool_frames()}</PanelTitle>
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
								// After the frames chosen, or at the end when none is.
								const after = chosen.length > 0 ? (keys[last] ?? null) : null;
								if (files.length > 0) void engine.addImages(files, after);
							}}
						/>
					</>
				)}
				{frames.length > 1 && (
					<Button
						aria-pressed={picking}
						onClick={() => {
							setPicking(!picking);
							if (picking) setSelected([]);
						}}
						className="aria-pressed:bg-ed-soft aria-pressed:text-ed-text aria-pressed:border-transparent"
					>
						<ListChecks className="size-4.5" aria-hidden="true" />
						{m.frames_select()}
					</Button>
				)}
				{picking && (
					<Button
						onClick={() => {
							setSelected(keys);
						}}
					>
						{m.frames_select_all()}
					</Button>
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
			{current && (
				<Section
					title={
						several ? m.frames_selected({ count: chosen.length }) : m.frame_number({ number: index + 1 })
					}
				>
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
										apply((doc) => setFrameDelays(doc, chosen, milliseconds / 1000));
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
						{ownFrames && (
							<>
								<IconButton
									label={m.frame_earlier()}
									disabled={!canShift(-step)}
									onClick={() => {
										shift(-step);
									}}
								>
									<ArrowLeft className="size-5" />
								</IconButton>
								<IconButton
									label={m.frame_later()}
									disabled={!canShift(step)}
									onClick={() => {
										shift(step);
									}}
								>
									<ArrowRight className="size-5" />
								</IconButton>
								<IconButton label={m.frame_duplicate()} onClick={duplicate}>
									<Copy className="size-5" />
								</IconButton>
							</>
						)}
						<IconButton label={m.frame_delete()} onClick={remove} disabled={chosen.length >= keys.length}>
							<Trash2 className="size-5" />
						</IconButton>
					</div>
					{!several && (
						<div className="grid gap-0.5">
							<button
								type="button"
								onClick={() => {
									void framePng(engine, current, index, fileName).then(async (file) => {
										if (file) await saveFile(file, file.name);
									});
								}}
								className={FRAME_ACTION}
							>
								<Download className="size-[1.1rem]" aria-hidden="true" />
								{m.frame_save()}
							</button>
							<button
								type="button"
								onClick={() => {
									setPlaying(false);
									void framePng(engine, current, index, fileName).then(async (file) => {
										if (!file) return;
										const kind = await open([file], 'image');
										if (kind) await navigate({ to: EDITORS[kind].path });
									});
								}}
								className={FRAME_ACTION}
							>
								<ImageUp className="size-[1.1rem]" aria-hidden="true" />
								{m.frame_edit()}
							</button>
						</div>
					)}
				</Section>
			)}
			<div
				ref={listRef}
				role="listbox"
				aria-label={m.tool_frames()}
				aria-multiselectable="true"
				className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2"
				onKeyDown={(event) => {
					if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
						event.preventDefault();
						setSelected(keys);
						return;
					}
					if (event.key === 'Escape' && several) {
						event.preventDefault();
						event.stopPropagation();
						setSelected([]);
						return;
					}
					if (event.key === 'Delete' || event.key === 'Backspace') {
						event.preventDefault();
						remove();
						return;
					}
					// Alt and the arrows move the frames chosen; the arrows alone step through them.
					if (!event.altKey || !ownFrames) return;
					const delta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
					if (delta === 0 || !canShift(delta)) return;
					event.preventDefault();
					shift(delta);
				}}
			>
				{frames.map((frame, shown) => {
					// A frame played twice (back and forth) has a button for each time.
					const repeat = frames.slice(0, shown).filter((before) => before.key === frame.key).length;
					const isChosen = chosen.includes(frame.key);
					return (
						<button
							key={`${frame.key}-${repeat}`}
							type="button"
							role="option"
							aria-selected={isChosen}
							aria-current={shown === index}
							aria-label={m.frame_number({ number: shown + 1 })}
							tabIndex={shown === index || (index < 0 && shown === 0) ? 0 : -1}
							draggable={ownFrames}
							onDragStart={(event) => {
								dragged.current = frame.key;
								event.dataTransfer.effectAllowed = 'move';
							}}
							onDragOver={(event) => {
								if (dragged.current !== null) event.preventDefault();
							}}
							onDrop={(event) => {
								const moved = dragged.current;
								dragged.current = null;
								if (moved === null || moved === frame.key) return;
								event.preventDefault();
								// Dragging one of the frames chosen moves them all.
								const group = chosen.includes(moved) ? chosen : [moved];
								if (group.includes(frame.key)) return;
								const target = keys
									.filter((candidate) => !group.includes(candidate))
									.indexOf(frame.key);
								const forward = keys.indexOf(moved) < keys.indexOf(frame.key);
								move(group, forward ? target + 1 : target);
							}}
							onDragEnd={() => {
								dragged.current = null;
							}}
							onClick={(event) => {
								pick(frame, event);
							}}
							className={`hover:bg-surface aria-selected:bg-ed-soft aria-selected:shadow-[inset_0_0_0_1.5px_var(--ed)] grid content-start gap-1 rounded-sm p-1 text-left transition-colors ${several && shown === index ? 'outline-ed outline-2 outline-offset-1' : ''}`}
						>
							<Thumbnail engine={engine} frame={frame} composer={composer} />
							<span className="text-caption text-muted tabular flex justify-between px-0.5">
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
