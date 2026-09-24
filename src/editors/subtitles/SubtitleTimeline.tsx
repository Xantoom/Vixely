import { ChevronsLeftRight, Pause, Play, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { memo, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { MIN_VIEW, type Range } from '@/document/timemap';
import { TimeRuler } from '@/editor/TimeRuler';
import { ViewScroll } from '@/editor/ViewScroll';
import { formatPreciseTime } from '@/lib/format';
import type { Peaks } from '@/media/peaks';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useCssColors } from '@/ui/css-colors';
import { useBoxSize } from '@/ui/use-box-size';
import { addCue, type Cue, MIN_CUE, type SubtitleDoc } from './document';
import type { SubtitleEngine } from './engine';
import { plainText } from './formats/markup';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Overlapping cues are stacked on up to this many rows. */
const MAX_LANES = 3;
/** Distance within which an edge snaps to the playhead or another cue, in CSS pixels. */
const SNAP = 8;
/** Width of the grab zone at each end of a cue, in CSS pixels. */
const EDGE = 7;
const WAVE_COLORS = ['--subtitles-2'] as const;

function zoomView(view: Range, factor: number, anchor: number): Range {
	return { start: anchor - (anchor - view.start) * factor, end: anchor + (view.end - anchor) * factor };
}

/** Row of each shown cue: the first row free at its start, so overlapping cues sit one above another. */
function assignLanes(cues: readonly Cue[]): { lanes: Map<number, number>; count: number } {
	const lanes = new Map<number, number>();
	const ends: number[] = [];
	const sorted = cues.filter((cue) => !cue.comment).toSorted((a, b) => a.start - b.start);
	for (const cue of sorted) {
		let lane = ends.findIndex((end) => end <= cue.start);
		if (lane === -1) lane = ends.length < MAX_LANES ? ends.length : MAX_LANES - 1;
		ends[lane] = Math.max(ends[lane] ?? 0, cue.end);
		lanes.set(cue.id, lane);
	}
	return { lanes, count: Math.max(1, ends.length) };
}

function Transport({ engine }: { engine: SubtitleEngine }) {
	const doc = useSubtitleDoc();
	const playing = useSubtitleEditor((state) => state.playing);
	const playhead = useSubtitleEditor((state) => state.playhead);
	const view = useSubtitleEditor((state) => state.view);
	const length = useSubtitleEditor((state) => state.length);
	const setView = useSubtitleEditor((state) => state.setView);
	const apply = useSubtitleEditor((state) => state.apply);
	const select = useSubtitleEditor((state) => state.select);
	const span = view.end - view.start;
	const anchor = playhead >= view.start && playhead <= view.end ? playhead : view.start + span / 2;
	const shown = doc.cues.filter((cue) => !cue.comment).length;

	return (
		<div className="flex items-center gap-3">
			<button
				type="button"
				aria-label={playing ? m.pause() : m.play()}
				title={playing ? m.pause() : m.play()}
				onClick={engine.togglePlay}
				className="bg-ed text-ed-ink grid size-9 flex-none place-items-center rounded-full transition-[filter] hover:brightness-[1.07]"
			>
				{playing ? (
					<Pause size={16} fill="currentColor" strokeWidth={0} />
				) : (
					<Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />
				)}
			</button>
			<span className="tabular font-mono text-[15px] font-medium" aria-label={m.playhead()}>
				{formatPreciseTime(playhead)}
			</span>
			<span className="text-ui text-muted tabular font-mono max-sm:hidden">/ {formatPreciseTime(length)}</span>
			<button
				type="button"
				onClick={() => {
					let created = 0;
					apply((current) => {
						const result = addCue(current, playhead * 1000);
						created = result.id;
						return result.doc;
					});
					select([created]);
				}}
				aria-label={m.subs_add_line()}
				title={m.subs_add_line()}
				className="text-ui text-ink-2 hover:text-ink hover:bg-surface ml-2 inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors"
			>
				<Plus size={15} aria-hidden="true" />
				<span className="max-sm:hidden">{m.subs_add_line()}</span>
			</button>
			<div className="flex-1" />
			<span className="text-small text-muted tabular max-sm:hidden">{m.subs_line_count({ count: shown })}</span>
			<div className="ml-2 flex gap-0.5">
				<IconButton
					label={m.zoom_out()}
					disabled={span >= length}
					onClick={() => {
						setView(zoomView(view, 2, anchor));
					}}
				>
					<ZoomOut size={17} />
				</IconButton>
				<IconButton
					label={m.zoom_in()}
					disabled={span <= MIN_VIEW}
					onClick={() => {
						setView(zoomView(view, 0.5, anchor));
					}}
				>
					<ZoomIn size={17} />
				</IconButton>
				<IconButton
					label={m.zoom_fit()}
					disabled={span >= length}
					onClick={() => {
						setView({ start: 0, end: length });
					}}
				>
					<ChevronsLeftRight size={17} />
				</IconButton>
			</div>
		</div>
	);
}

/** The sound of the preview video, so lines can be placed where they're spoken. */
function Waveform({ peaks, version, view }: { peaks: Peaks | null; version: number; view: Range }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = useBoxSize(canvasRef);
	const [color = ''] = useCssColors(WAVE_COLORS);
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || size.width === 0) return;
		const ratio = window.devicePixelRatio || 1;
		const width = Math.round(size.width * ratio);
		const height = Math.round(size.height * ratio);
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		context.clearRect(0, 0, width, height);
		if (!peaks) return;
		const middle = height / 2;
		const span = view.end - view.start;
		const out = { min: 0, max: 0 };
		context.fillStyle = color;
		context.globalAlpha = 0.55;
		for (let x = 0; x < width; x++) {
			const from = view.start + (x / width) * span;
			if (!peaks.range(from, from + span / width, out)) continue;
			const y = middle - out.max * middle * 0.94;
			context.fillRect(x, y, 1, Math.max(ratio, middle - out.min * middle * 0.94 - y));
		}
	}, [peaks, version, view, size, color]);
	return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />;
}

interface Drag {
	mode: 'move' | 'start' | 'end';
	pointerX: number;
	/** Times of the cues being dragged when the drag started. */
	origins: Map<number, { start: number; end: number }>;
	/** The cue under the pointer: its edges are the ones that snap. */
	lead: number;
	moved: boolean;
}

/** The cue blocks: drawn only when the document, the view or the selection change, not while playing. */
const CueBlocks = memo(function CueBlocks({
	doc,
	view,
	selection,
	width,
	onSeek,
}: {
	doc: SubtitleDoc;
	view: Range;
	selection: ReadonlySet<number>;
	width: number;
	onSeek: (time: number) => void;
}) {
	const preview = useSubtitleEditor((state) => state.preview);
	const settle = useSubtitleEditor((state) => state.settle);
	const select = useSubtitleEditor((state) => state.select);
	const drag = useRef<Drag | null>(null);
	const { lanes, count } = useMemo(() => assignLanes(doc.cues), [doc.cues]);
	const span = (view.end - view.start) * 1000;
	const viewStart = view.start * 1000;
	const msPerPixel = width > 0 ? span / width : 0;
	const visible = doc.cues.filter((cue) => !cue.comment && cue.end > viewStart && cue.start < viewStart + span);
	// Text only fits when there are few cues on screen.
	const labelled = visible.length < 400;

	const snapTargets = (ignore: ReadonlySet<number>): number[] => {
		const targets = [useSubtitleEditor.getState().playhead * 1000];
		for (const cue of visible) {
			if (ignore.has(cue.id)) continue;
			targets.push(cue.start, cue.end);
		}
		return targets;
	};
	const snap = (time: number, targets: readonly number[], off: boolean): number => {
		if (off) return time;
		let best = time;
		let distance = SNAP * msPerPixel;
		for (const target of targets) {
			if (Math.abs(target - time) < distance) {
				distance = Math.abs(target - time);
				best = target;
			}
		}
		return best;
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, cue: Cue) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const rect = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const mode =
			x < EDGE && rect.width > EDGE * 3
				? 'start'
				: x > rect.width - EDGE && rect.width > EDGE * 3
					? 'end'
					: 'move';
		let ids: Set<number>;
		if (event.ctrlKey || event.metaKey || event.shiftKey) {
			ids = new Set(selection);
			if (ids.has(cue.id) && !event.shiftKey) ids.delete(cue.id);
			else ids.add(cue.id);
		} else {
			ids = selection.has(cue.id) && mode === 'move' ? new Set(selection) : new Set([cue.id]);
		}
		select(ids, ids.has(cue.id) ? cue.id : null);
		const moving = mode === 'move' ? ids : new Set([cue.id]);
		const origins = new Map(
			doc.cues
				.filter((other) => moving.has(other.id))
				.map((other) => [other.id, { start: other.start, end: other.end }]),
		);
		drag.current = { mode, pointerX: event.clientX, origins, lead: cue.id, moved: false };
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current) return;
		if (!current.moved && Math.abs(event.clientX - current.pointerX) < 3) return;
		current.moved = true;
		const delta = (event.clientX - current.pointerX) * msPerPixel;
		const lead = current.origins.get(current.lead);
		if (!lead) return;
		const targets = snapTargets(new Set(current.origins.keys()));
		// Alt turns snapping off, for placing an edge freely.
		const off = event.altKey;
		if (current.mode === 'move') {
			// Whichever edge is closer to something snaps; the cue keeps its length.
			const toStart = snap(lead.start + delta, targets, off) - (lead.start + delta);
			const toEnd = snap(lead.end + delta, targets, off) - (lead.end + delta);
			const useStart = toStart !== 0 && (toEnd === 0 || Math.abs(toStart) <= Math.abs(toEnd));
			const shift = delta + (useStart ? toStart : toEnd);
			const earliest = Math.min(...[...current.origins.values()].map((origin) => origin.start));
			const applied = Math.max(-earliest, shift);
			preview((doc) => ({
				...doc,
				cues: doc.cues.map((cue) => {
					const origin = current.origins.get(cue.id);
					if (!origin) return cue;
					return { ...cue, start: Math.round(origin.start + applied), end: Math.round(origin.end + applied) };
				}),
			}));
		} else {
			const edge = snap((current.mode === 'start' ? lead.start : lead.end) + delta, targets, off);
			const start = current.mode === 'start' ? Math.max(0, Math.min(edge, lead.end - MIN_CUE)) : lead.start;
			const end = current.mode === 'end' ? Math.max(edge, lead.start + MIN_CUE) : lead.end;
			preview((doc) => ({
				...doc,
				cues: doc.cues.map((cue) =>
					cue.id === current.lead ? { ...cue, start: Math.round(start), end: Math.round(end) } : cue,
				),
			}));
		}
	};

	const onPointerUp = () => {
		const current = drag.current;
		drag.current = null;
		if (!current) return;
		if (current.moved) settle();
		else {
			const lead = current.origins.get(current.lead);
			if (lead) onSeek(lead.start / 1000);
		}
	};

	return (
		<>
			{visible.map((cue) => {
				const lane = lanes.get(cue.id) ?? 0;
				const left = ((cue.start - viewStart) / span) * 100;
				const right = ((cue.end - viewStart) / span) * 100;
				const selected = selection.has(cue.id);
				return (
					<div
						key={cue.id}
						role="button"
						tabIndex={-1}
						aria-label={m.subs_line_label({ time: formatPreciseTime(cue.start / 1000) })}
						aria-pressed={selected}
						onPointerDown={(event) => {
							onPointerDown(event, cue);
						}}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={() => {
							drag.current = null;
							settle();
						}}
						onDoubleClick={(event) => {
							event.stopPropagation();
						}}
						className={`absolute cursor-grab overflow-hidden rounded-[3px] px-1.5 py-1 text-[11.5px] leading-tight select-none active:cursor-grabbing ${
							selected
								? 'bg-ed text-ed-ink shadow-[inset_0_0_0_1px_var(--ed)]'
								: 'text-ink bg-[color-mix(in_srgb,var(--ed)_13%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ed)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--ed)_22%,transparent)]'
						}`}
						style={{
							left: `${left}%`,
							width: `${Math.max(0.05, right - left)}%`,
							top: `calc(${(lane / count) * 100}% + 4px)`,
							height: `calc(${100 / count}% - 8px)`,
						}}
					>
						{/* Both ends resize: the cursor says so at the edges. */}
						<span className="absolute inset-y-0 left-0 w-[7px] cursor-ew-resize" aria-hidden="true" />
						<span className="absolute inset-y-0 right-0 w-[7px] cursor-ew-resize" aria-hidden="true" />
						{labelled && ((cue.end - cue.start) / msPerPixel > 28 || msPerPixel === 0) && (
							<span className="line-clamp-3 overflow-hidden whitespace-pre-line">
								{plainText(cue.text, doc.format)}
							</span>
						)}
					</div>
				);
			})}
		</>
	);
});

function Playhead({ view }: { view: Range }) {
	const playhead = useSubtitleEditor((state) => state.playhead);
	if (playhead < view.start || playhead > view.end) return null;
	return (
		<div
			className="bg-ink pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2"
			style={{ left: `${((playhead - view.start) / (view.end - view.start)) * 100}%` }}
			aria-hidden="true"
		/>
	);
}

/**
 * The subtitle track: every line as a block on the time scale, over the waveform of the preview
 * video. Blocks move by dragging, and their ends set when a line appears and disappears.
 */
function Track({ engine }: { engine: SubtitleEngine }) {
	const doc = useSubtitleDoc();
	const view = useSubtitleEditor((state) => state.view);
	const selection = useSubtitleEditor((state) => state.selection);
	const apply = useSubtitleEditor((state) => state.apply);
	const select = useSubtitleEditor((state) => state.select);
	const areaRef = useRef<HTMLDivElement>(null);
	const { width } = useBoxSize(areaRef);
	const scrub = useRef(false);

	const timeAt = (clientX: number) => {
		const area = areaRef.current;
		if (!area) return 0;
		const rect = area.getBoundingClientRect();
		const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return view.start + x * (view.end - view.start);
	};

	// Ctrl or ⌘ + wheel zooms around the pointer; the wheel alone scrolls a zoomed timeline.
	useEffect(() => {
		const area = areaRef.current;
		if (!area) return;
		const onWheel = (event: WheelEvent) => {
			const state = useSubtitleEditor.getState();
			const current = state.view;
			const span = current.end - current.start;
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				const rect = area.getBoundingClientRect();
				const anchor = current.start + ((event.clientX - rect.left) / rect.width) * span;
				state.setView(zoomView(current, Math.exp(event.deltaY * 0.0025), anchor));
				return;
			}
			if (span >= state.length) return;
			const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
			if (delta === 0) return;
			event.preventDefault();
			const shift = (delta / area.clientWidth) * span;
			state.setView({ start: current.start + shift, end: current.end + shift });
		};
		area.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			area.removeEventListener('wheel', onWheel);
		};
	}, []);

	return (
		<div
			ref={areaRef}
			id="subtitle-track"
			role="group"
			aria-label={m.subs_track()}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				event.currentTarget.setPointerCapture(event.pointerId);
				scrub.current = true;
				select([]);
				engine.seek(timeAt(event.clientX));
			}}
			onPointerMove={(event) => {
				if (scrub.current) engine.seek(timeAt(event.clientX));
			}}
			onPointerUp={() => {
				scrub.current = false;
			}}
			onDoubleClick={(event) => {
				// A double click on free space adds a line there.
				let created = 0;
				apply((current) => {
					const result = addCue(current, timeAt(event.clientX) * 1000);
					created = result.id;
					return result.doc;
				});
				select([created]);
			}}
			className="relative h-28 cursor-text touch-none overflow-hidden rounded-xs bg-[color-mix(in_srgb,var(--ed)_5%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ed)_20%,transparent)] select-none lg:h-32"
		>
			<Waveform peaks={engine.waveform.peaks} version={engine.waveform.version} view={view} />
			<CueBlocks doc={doc} view={view} selection={selection} width={width} onSeek={engine.seek} />
			<Playhead view={view} />
		</div>
	);
}

export function SubtitleTimeline({ engine }: { engine: SubtitleEngine }) {
	const view = useSubtitleEditor((state) => state.view);
	const length = useSubtitleEditor((state) => state.length);
	const setView = useSubtitleEditor((state) => state.setView);

	// While playing, the view turns the page when the playhead leaves it.
	useEffect(
		() =>
			useSubtitleEditor.subscribe((state, previous) => {
				if (!state.playing || state.playhead === previous.playhead) return;
				const { start, end } = state.view;
				if (state.playhead >= start && state.playhead <= end) return;
				const span = end - start;
				state.setView({ start: state.playhead - span * 0.02, end: state.playhead + span * 0.98 });
			}),
		[],
	);

	return (
		<section aria-label={m.timeline()} className="border-line grid gap-2 border-t px-4 pt-2.5 pb-3">
			<Transport engine={engine} />
			<div className="grid gap-1">
				<TimeRuler view={view} onSeek={engine.seek} />
				<Track engine={engine} />
				<ViewScroll view={view} duration={length} onView={setView} controls="subtitle-track" />
			</div>
		</section>
	);
}
