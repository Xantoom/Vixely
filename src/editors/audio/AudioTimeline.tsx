import { ChevronsLeftRight, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useLayoutEffect,
	useRef,
} from 'react';
import type { Range } from '@/document/timemap';
import { TimeRuler } from '@/editor/TimeRuler';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useCssColors } from '@/ui/css-colors';
import { useBoxSize } from '@/ui/use-box-size';
import { type AudioDoc, envelope, keptRanges, outputDuration, restoreCut, setTrim, sourceGainAt } from './document';
import type { AudioEngine } from './engine';
import { MIN_VIEW, useAudioDoc, useAudioEditor } from './store';

/** Waveform, removed audio, and audio pushed past full scale. */
const WAVE_COLORS = ['--audio-1', '--line-2', '--danger'] as const;
/** Arrow keys move a trim handle by this much; with Shift, ten times more. */
const HANDLE_STEP = 0.1;

function percent(time: number, view: Range): string {
	return `${((time - view.start) / (view.end - view.start)) * 100}%`;
}

/** Source time under a pointer, within the source. */
function timeAt(element: HTMLElement, clientX: number, view: Range, duration: number): number {
	const rect = element.getBoundingClientRect();
	const x = (clientX - rect.left) / rect.width;
	return Math.min(duration, Math.max(0, view.start + x * (view.end - view.start)));
}

function zoomView(view: Range, factor: number, anchor: number): Range {
	return { start: anchor - (anchor - view.start) * factor, end: anchor + (view.end - anchor) * factor };
}

function Transport({ engine }: { engine: AudioEngine }) {
	const doc = useAudioDoc();
	const playing = useAudioEditor((state) => state.playing);
	const playhead = useAudioEditor((state) => state.playhead);
	const view = useAudioEditor((state) => state.view);
	const setView = useAudioEditor((state) => state.setView);
	const { peaks, failed } = engine.waveform;
	const progress = peaks ? peaks.progress() : 0;
	const span = view.end - view.start;
	// Zoom around the playhead when it is visible, around the middle otherwise.
	const anchor = playhead >= view.start && playhead <= view.end ? playhead : view.start + span / 2;

	return (
		<div className="flex items-center gap-3">
			<button
				type="button"
				aria-label={playing ? m.pause() : m.play()}
				title={playing ? m.pause() : m.play()}
				disabled={!engine.player || failed}
				onClick={engine.togglePlay}
				className="bg-ed text-ed-ink grid size-9 flex-none place-items-center rounded-full transition-[filter] enabled:hover:brightness-[1.07] disabled:opacity-45"
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
			{failed ? (
				<span className="text-small text-danger truncate">{m.waveform_failed()}</span>
			) : (
				progress < 1 &&
				peaks && (
					<span className="text-small text-muted tabular truncate">
						{m.waveform_reading({ percent: Math.floor(progress * 100) })}
					</span>
				)
			)}
			<div className="flex-1" />
			<span className="text-ui text-muted max-sm:hidden">{m.audio_final_length()}</span>
			<span className="tabular font-mono text-[12.5px] max-sm:hidden">
				{formatPreciseTime(outputDuration(doc))}
			</span>
			<div className="ml-2 flex gap-0.5">
				<IconButton
					label={m.zoom_out()}
					disabled={span >= doc.duration}
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
					disabled={span >= doc.duration}
					onClick={() => {
						setView({ start: 0, end: doc.duration });
					}}
				>
					<ChevronsLeftRight size={17} />
				</IconButton>
			</div>
		</div>
	);
}

function Playhead({ view }: { view: Range }) {
	const playhead = useAudioEditor((state) => state.playhead);
	if (playhead < view.start || playhead > view.end) return null;
	return (
		<div
			className="bg-ink pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2"
			style={{ left: percent(playhead, view) }}
			aria-hidden="true"
		/>
	);
}

/** Handle at one end of the kept audio. Dragged, or moved with the arrow keys. */
function TrimHandle({ side, doc, view }: { side: 'start' | 'end'; doc: AudioDoc; view: Range }) {
	const preview = useAudioEditor((state) => state.preview);
	const settle = useAudioEditor((state) => state.settle);
	const time = doc.trim[side];
	const move = (to: number) => {
		preview((current) => setTrim(current, { ...current.trim, [side]: to }));
	};
	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
		const area = event.currentTarget.parentElement;
		if (area) move(timeAt(area, event.clientX, view, doc.duration));
	};
	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const step = event.shiftKey ? HANDLE_STEP * 10 : HANDLE_STEP;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			event.stopPropagation();
			move(time + (event.key === 'ArrowLeft' ? -step : step));
		}
	};
	if (time < view.start || time > view.end) return null;
	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={side === 'start' ? m.trim_handle_start() : m.trim_handle_end()}
			aria-valuemin={0}
			aria-valuemax={doc.duration}
			aria-valuenow={time}
			aria-valuetext={formatPreciseTime(time)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={settle}
			onPointerCancel={settle}
			onKeyDown={onKeyDown}
			onKeyUp={settle}
			onBlur={settle}
			className="group absolute inset-y-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
			style={{ left: percent(time, view) }}
		>
			<span className="bg-ed absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full" />
			<span className="bg-ed absolute top-1/2 left-1/2 h-7 w-2.5 -translate-1/2 rounded-full shadow-[0_0_0_2px_var(--bg)] transition-transform group-hover:scale-110 group-focus-visible:scale-110" />
		</div>
	);
}

/** The waveform, with what is kept, removed and selected, and the trim handles. */
function WaveArea({ engine, trimmable }: { engine: AudioEngine; trimmable: boolean }) {
	// Drawn as it sounds: with normalization, the gain comes from the measured loudness.
	const doc = engine.resolved;
	const view = useAudioEditor((state) => state.view);
	const selection = useAudioEditor((state) => state.selection);
	const setSelection = useAudioEditor((state) => state.setSelection);
	const setView = useAudioEditor((state) => state.setView);
	const apply = useAudioEditor((state) => state.apply);
	const areaRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = useBoxSize(areaRef);
	const [wave = '', muted = '', clip = ''] = useCssColors(WAVE_COLORS);
	const drag = useRef<{ x: number; time: number; moved: boolean } | null>(null);
	const { peaks, version } = engine.waveform;

	// Drawn column by column: each device pixel shows the loudest and quietest moment it covers,
	// scaled by the volume curve, so gain and fades are visible before they are heard.
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
		const middle = height / 2;
		const half = middle - 2 * ratio;
		context.fillStyle = muted;
		context.fillRect(0, Math.round(middle - ratio / 2), width, Math.max(1, Math.round(ratio)));
		if (!peaks) return;

		const ranges = keptRanges(doc);
		const points = envelope(doc);
		const span = view.end - view.start;
		const out = { min: 0, max: 0 };
		let fill = '';
		for (let x = 0; x < width; x++) {
			const from = view.start + (x / width) * span;
			const to = view.start + ((x + 1) / width) * span;
			if (!peaks.range(from, to, out)) continue;
			const gain = sourceGainAt(ranges, points, (from + to) / 2);
			const scale = gain ?? 1;
			const top = out.max * scale;
			const bottom = out.min * scale;
			const color = gain === null ? muted : top > 1 || bottom < -1 ? clip : wave;
			if (color !== fill) {
				context.fillStyle = color;
				fill = color;
			}
			const y = middle - Math.min(1, top) * half;
			const h = Math.max(ratio, middle - Math.max(-1, bottom) * half - y);
			context.fillRect(x, y, 1, h);
		}
	}, [peaks, version, doc, view, size, wave, muted, clip]);

	// Ctrl or ⌘ + wheel zooms around the pointer; the wheel alone scrolls a zoomed timeline.
	useEffect(() => {
		const area = areaRef.current;
		if (!area) return;
		const onWheel = (event: WheelEvent) => {
			const state = useAudioEditor.getState();
			const current = state.view;
			const duration = state.history.present.duration;
			const span = current.end - current.start;
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				const anchor = timeAt(area, event.clientX, current, duration);
				state.setView(zoomView(current, Math.exp(event.deltaY * 0.0025), anchor));
				return;
			}
			if (span >= duration) return;
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
	}, [setView]);

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = {
			x: event.clientX,
			time: timeAt(event.currentTarget, event.clientX, view, doc.duration),
			moved: false,
		};
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current) return;
		if (!trimmable || (!current.moved && Math.abs(event.clientX - current.x) < 4)) return;
		current.moved = true;
		const time = timeAt(event.currentTarget, event.clientX, view, doc.duration);
		setSelection({ start: Math.min(current.time, time), end: Math.max(current.time, time) });
	};
	const onPointerUp = () => {
		const current = drag.current;
		drag.current = null;
		if (!current) return;
		if (!current.moved) {
			setSelection(null);
			engine.seek(current.time);
			return;
		}
		// Playback then starts from the selection, unless it is already running.
		const selected = useAudioEditor.getState().selection;
		if (selected && !engine.player?.playing) engine.seek(selected.start);
	};

	const visible = (range: Range) => range.end > view.start && range.start < view.end;
	const box = (range: Range) => ({
		left: percent(Math.max(range.start, view.start), view),
		width: `${((Math.min(range.end, view.end) - Math.max(range.start, view.start)) / (view.end - view.start)) * 100}%`,
	});
	const outside = [
		{ start: 0, end: doc.trim.start },
		{ start: doc.trim.end, end: doc.duration },
	].filter((range) => range.end > range.start && visible(range));

	return (
		<div
			ref={areaRef}
			role="group"
			aria-label={m.waveform()}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={() => {
				drag.current = null;
			}}
			className="relative h-24 cursor-text touch-none rounded-xs bg-[color-mix(in_srgb,var(--audio-1)_6%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--audio-1)_22%,transparent)] select-none lg:h-32"
		>
			<canvas ref={canvasRef} className="absolute inset-0 size-full" />
			{outside.map((range) => (
				<div
					key={range.start}
					className="bg-canvas/65 pointer-events-none absolute inset-y-0"
					style={box(range)}
				/>
			))}
			{doc.cuts.map((removed, index) =>
				visible(removed) ? (
					<div
						key={`${removed.start}-${removed.end}`}
						className="bg-canvas/65 absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--ink)_12%,transparent)_6px_7px)] shadow-[inset_1px_0_0_var(--line-2),inset_-1px_0_0_var(--line-2)]"
						style={box(removed)}
					>
						<button
							type="button"
							aria-label={m.removed_restore_label({
								start: formatPreciseTime(removed.start),
								end: formatPreciseTime(removed.end),
							})}
							title={m.removed_restore()}
							onPointerDown={(event) => {
								event.stopPropagation();
							}}
							onClick={() => {
								apply((current) => restoreCut(current, index));
							}}
							className="bg-bg text-ink-2 hover:text-ink absolute top-1.5 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full shadow-[0_0_0_1px_var(--line-2)] transition-colors"
						>
							<RotateCcw size={12} strokeWidth={2.4} />
						</button>
					</div>
				) : null,
			)}
			{selection && visible(selection) && (
				<div
					className="bg-ink/10 pointer-events-none absolute inset-y-0 shadow-[inset_1px_0_0_var(--ink),inset_-1px_0_0_var(--ink)]"
					style={box(selection)}
				/>
			)}
			{trimmable && <TrimHandle side="start" doc={doc} view={view} />}
			{trimmable && <TrimHandle side="end" doc={doc} view={view} />}
			<Playhead view={view} />
		</div>
	);
}

/** Thin bar under a zoomed timeline: shows and moves the visible part. */
function ViewScroll() {
	const view = useAudioEditor((state) => state.view);
	const duration = useAudioEditor((state) => state.history.present.duration);
	const setView = useAudioEditor((state) => state.setView);
	const grab = useRef<{ x: number; start: number } | null>(null);
	const span = view.end - view.start;
	// The row is always there, so zooming never changes the height of the timeline.
	if (span >= duration) return <div className="h-3" aria-hidden="true" />;

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		const track = event.currentTarget;
		track.setPointerCapture(event.pointerId);
		const rect = track.getBoundingClientRect();
		const time = ((event.clientX - rect.left) / rect.width) * duration;
		// Pressing outside the thumb centres the view there first.
		const start = time < view.start || time > view.end ? time - span / 2 : view.start;
		setView({ start, end: start + span });
		grab.current = { x: event.clientX, start };
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = grab.current;
		if (!current) return;
		const shift = ((event.clientX - current.x) / event.currentTarget.clientWidth) * duration;
		setView({ start: current.start + shift, end: current.start + shift + span });
	};

	return (
		<div
			role="scrollbar"
			aria-label={m.timeline_scroll()}
			aria-orientation="horizontal"
			aria-valuemin={0}
			aria-valuemax={Math.round(duration)}
			aria-valuenow={Math.round(view.start)}
			aria-controls="audio-waveform"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={() => {
				grab.current = null;
			}}
			className="group relative h-3 cursor-pointer touch-none"
		>
			<div className="bg-surface-2 absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" />
			<div
				className="bg-line-2 group-hover:bg-muted absolute top-1/2 h-1.5 min-w-4 -translate-y-1/2 rounded-full transition-colors"
				style={{ left: `${(view.start / duration) * 100}%`, width: `${(span / duration) * 100}%` }}
			/>
		</div>
	);
}

/**
 * Timeline of the audio editor. It shows the whole source: removed audio stays visible, greyed
 * out, so any edit can be seen and undone.
 */
/** `trimmable` is false in a batch, where cutting doesn't apply: the waveform is for listening only. */
export function AudioTimeline({ engine, trimmable }: { engine: AudioEngine; trimmable: boolean }) {
	const view = useAudioEditor((state) => state.view);

	// While playing, the view turns the page when the playhead leaves it.
	useEffect(
		() =>
			useAudioEditor.subscribe((state, previous) => {
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
			<div id="audio-waveform" className="grid gap-1">
				<TimeRuler view={view} onSeek={engine.seek} />
				<WaveArea engine={engine} trimmable={trimmable} />
				<ViewScroll />
			</div>
		</section>
	);
}
