import { AudioLines, ChevronFirst, ChevronLast, Play, ZoomIn, ZoomOut } from 'lucide-react';
import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type WheelEvent as ReactWheelEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { clampView, type Range } from '@/document/timemap';
import { TimeRuler } from '@/editor/TimeRuler';
import { ViewScroll } from '@/editor/ViewScroll';
import { type Peaks, type PeaksReader, readPeaks } from '@/media/peaks';
import { usePlayback, usePlaybackLength } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useCssColors } from '@/ui/css-colors';
import { useBoxSize } from '@/ui/use-box-size';
import { addCue, type Cue, findCue, MIN_CUE, setCueTimes } from './document';
import { cueLabel } from './labels';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Seconds shown at first: a few lines, enough to hear each one start and end. */
const DEFAULT_SPAN = 12;
const MIN_SPAN = 1;
/** Played before or after a line with Q and W, in seconds. */
export const AROUND = 0.5;
/** Distance within which an edge snaps to the playhead or another line, in CSS pixels. */
const SNAP = 8;
const WAVE_COLORS = ['--audio-1'] as const;

/**
 * The waveform read once per file and audio track, and kept when the editor is left and
 * reopened: long files take a few seconds.
 */
let cached: { file: File; track: number | null; reader: PeaksReader } | null = null;
/** Waveforms on screen, told when more of the file is read. */
const listeners = new Set<() => void>();

function usePeaks(): { peaks: Peaks | null; version: number } {
	const file = usePlayback((state) => state.file);
	const duration = usePlayback((state) => state.details?.duration ?? null);
	const track = usePlayback((state) => state.audioTrack);
	const [version, setVersion] = useState(0);
	const [peaks, setPeaks] = useState<Peaks | null>(null);

	useEffect(() => {
		if (!file || duration === null || track === null) {
			setPeaks(null);
			return;
		}
		if (cached?.file !== file || cached.track !== track) {
			cached?.reader.cancel();
			const reader = readPeaks(
				file,
				duration,
				() => {
					for (const listener of listeners) listener();
				},
				track,
			);
			reader.done.catch(() => undefined);
			cached = { file, track, reader };
		}
		setPeaks(cached.reader.peaks);
		const listener = () => {
			setVersion((value) => value + 1);
		};
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}, [file, duration, track]);

	return { peaks, version };
}

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
	/** Moving an edge of the line, or marking a new range. */
	mode: 'start' | 'end' | 'range';
	/** Time where the pointer went down, in milliseconds. */
	anchor: number;
	moved: boolean;
}

/** The playhead, moved on every frame without redrawing the rest. */
function PlayheadLine({ view }: { view: Range }) {
	const time = usePlayback((state) => state.time);
	const left = ((time - view.start) / (view.end - view.start)) * 100;
	if (left < 0 || left > 100) return null;
	return (
		<div
			className="bg-ink pointer-events-none absolute inset-y-0 w-px"
			style={{ left: `${left}%` }}
			aria-hidden="true"
		/>
	);
}

/**
 * The sound around the line being edited, as in Aegisub: the line's start and end sit on the
 * waveform and are set by clicking (left for the start, right for the end), dragging an edge, or
 * dragging across a spoken passage. Neighbouring lines show in the background.
 */
export function AudioBox() {
	const doc = useSubtitleDoc();
	const active = useSubtitleEditor((state) => state.active);
	const preview = useSubtitleEditor((state) => state.preview);
	const settle = useSubtitleEditor((state) => state.settle);
	const apply = useSubtitleEditor((state) => state.apply);
	const select = useSubtitleEditor((state) => state.select);
	const file = usePlayback((state) => state.file);
	const hasAudio = usePlayback((state) => state.audioTrack !== null);
	const seek = usePlayback((state) => state.seek);
	const playRange = usePlayback((state) => state.playRange);
	const length = usePlaybackLength();
	const { peaks, version } = usePeaks();
	const areaRef = useRef<HTMLDivElement>(null);
	const { width } = useBoxSize(areaRef);
	const [view, setViewState] = useState<Range>({ start: 0, end: DEFAULT_SPAN });
	const drag = useRef<Drag | null>(null);
	const cue = active === null ? undefined : findCue(doc, active);
	const span = view.end - view.start;
	const setView = (next: Range) => {
		setViewState(clampView(next, Math.max(length, MIN_SPAN)));
	};

	// The line picked elsewhere comes into view, with some room around it.
	useEffect(() => {
		if (!cue) return;
		const start = cue.start / 1000;
		const end = cue.end / 1000;
		setViewState((current) => {
			const currentSpan = current.end - current.start;
			if (start >= current.start && end <= current.end) return current;
			const room = Math.max(0, (currentSpan - (end - start)) / 2);
			return clampView({ start: start - room, end: start - room + currentSpan }, Math.max(length, MIN_SPAN));
		});
		// Only a new line moves the view, not every edit of its times.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [cue?.id]);

	// While playing, the view turns the page when the playhead leaves it.
	useEffect(
		() =>
			usePlayback.subscribe((state) => {
				if (!state.playing) return;
				setViewState((current) => {
					if (state.time < current.end && state.time >= current.start) return current;
					const currentSpan = current.end - current.start;
					return clampView({ start: state.time, end: state.time + currentSpan }, Math.max(length, MIN_SPAN));
				});
			}),
		[length],
	);

	const timeAt = (clientX: number): number => {
		const rect = areaRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return 0;
		return Math.max(0, (view.start + ((clientX - rect.left) / rect.width) * span) * 1000);
	};

	/** Snaps a time to the playhead or the edges of other lines, unless Alt is held. */
	const snap = (time: number, alt: boolean): number => {
		if (alt || width === 0) return time;
		const limit = (SNAP / width) * span * 1000;
		const targets = [usePlayback.getState().time * 1000];
		for (const other of doc.cues) {
			if (other.id === cue?.id || other.comment) continue;
			targets.push(other.start, other.end);
		}
		let best = time;
		let distance = limit;
		for (const target of targets) {
			if (Math.abs(target - time) < distance) {
				best = target;
				distance = Math.abs(target - time);
			}
		}
		return best;
	};

	const setTimes = (target: Cue, start: number, end: number) => {
		preview((current) => setCueTimes(current, target.id, Math.round(start), Math.round(end)));
	};

	const edgeUnder = (clientX: number): 'start' | 'end' | null => {
		if (!cue || width === 0) return null;
		const pixels = (time: number) => ((time / 1000 - view.start) / span) * width;
		const rect = areaRef.current?.getBoundingClientRect();
		const x = clientX - (rect?.left ?? 0);
		if (Math.abs(x - pixels(cue.start)) <= 6) return 'start';
		if (Math.abs(x - pixels(cue.end)) <= 6) return 'end';
		return null;
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 && event.button !== 2) return;
		const time = snap(timeAt(event.clientX), event.altKey);
		if (event.button === 2) {
			// Right click sets the end, as in Aegisub.
			if (cue) apply((current) => setCueTimes(current, cue.id, cue.start, Math.max(time, cue.start + MIN_CUE)));
			return;
		}
		event.currentTarget.setPointerCapture(event.pointerId);
		const edge = edgeUnder(event.clientX);
		drag.current = { mode: edge ?? 'range', anchor: time, moved: false };
	};

	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const state = drag.current;
		const edge = edgeUnder(event.clientX);
		event.currentTarget.style.cursor = state || edge ? 'ew-resize' : 'crosshair';
		if (!state) return;
		const time = snap(timeAt(event.clientX), event.altKey);
		if (!state.moved && Math.abs(time - state.anchor) < (3 / Math.max(width, 1)) * span * 1000) return;
		state.moved = true;
		if (state.mode === 'start' && cue) setTimes(cue, Math.min(time, cue.end - MIN_CUE), cue.end);
		else if (state.mode === 'end' && cue) setTimes(cue, cue.start, Math.max(time, cue.start + MIN_CUE));
		else if (cue)
			setTimes(
				cue,
				Math.min(state.anchor, time),
				Math.max(state.anchor, time, Math.min(state.anchor, time) + MIN_CUE),
			);
	};

	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		const state = drag.current;
		drag.current = null;
		if (!state) return;
		if (state.moved) {
			if (!cue && state.mode === 'range') {
				const time = snap(timeAt(event.clientX), event.altKey);
				let created = 0;
				apply((current) => {
					const result = addCue(current, Math.min(state.anchor, time));
					created = result.id;
					return setCueTimes(
						result.doc,
						result.id,
						Math.min(state.anchor, time),
						Math.max(state.anchor, time),
					);
				});
				select([created]);
			}
			settle();
			return;
		}
		// A click sets the start, as in Aegisub; without a line, it moves the playhead.
		if (cue && state.mode === 'range') {
			apply((current) => setCueTimes(current, cue.id, state.anchor, Math.max(cue.end, state.anchor + MIN_CUE)));
		} else if (!cue) {
			seek(state.anchor / 1000);
		}
	};

	const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			const anchor = timeAt(event.clientX) / 1000;
			const factor = event.deltaY > 0 ? 1.25 : 0.8;
			const next = Math.min(Math.max(span * factor, MIN_SPAN), Math.max(length, MIN_SPAN));
			const ratio = (anchor - view.start) / span;
			setView({ start: anchor - ratio * next, end: anchor - ratio * next + next });
			return;
		}
		const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
		setView({
			start: view.start + (delta / Math.max(width, 1)) * span,
			end: view.end + (delta / Math.max(width, 1)) * span,
		});
	};

	// Ctrl+wheel must not zoom the page.
	useEffect(() => {
		const area = areaRef.current;
		if (!area) return;
		const block = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey) event.preventDefault();
		};
		area.addEventListener('wheel', block, { passive: false });
		return () => {
			area.removeEventListener('wheel', block);
		};
	}, []);

	const zoom = (factor: number) => {
		const next = Math.min(Math.max(span * factor, MIN_SPAN), Math.max(length, MIN_SPAN));
		const middle = cue ? (cue.start + cue.end) / 2000 : view.start + span / 2;
		setView({ start: middle - next / 2, end: middle + next / 2 });
	};

	const toX = (time: number) => ((time / 1000 - view.start) / span) * 100;
	const visible = doc.cues.filter(
		(line) => !line.comment && line.end / 1000 > view.start && line.start / 1000 < view.end,
	);

	return (
		<div className="flex h-full min-h-0 flex-col gap-1.5">
			<TimeRuler view={view} onSeek={seek} />
			<div
				ref={areaRef}
				id="subtitle-audio"
				role="application"
				aria-label={m.subs_audio()}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={() => {
					drag.current = null;
					settle();
				}}
				onContextMenu={(event: ReactMouseEvent) => {
					event.preventDefault();
				}}
				onWheel={onWheel}
				className="bg-surface relative min-h-16 flex-1 cursor-crosshair touch-none overflow-hidden rounded-xs shadow-[inset_0_0_0_1px_var(--line)] select-none"
			>
				{visible.map((line) =>
					line.id === cue?.id ? null : (
						<div
							key={line.id}
							className="bg-ed/10 border-ed/40 absolute inset-y-0 border-x"
							style={{ left: `${toX(line.start)}%`, width: `${toX(line.end) - toX(line.start)}%` }}
						>
							<span className="text-caption text-muted absolute top-1 right-1 left-1 truncate">
								{width > 0 && ((line.end - line.start) / 1000 / span) * width > 40
									? cueLabel(line, doc.format).replace(/\n/g, ' ')
									: ''}
							</span>
						</div>
					),
				)}
				{cue && (
					<div
						className="bg-ed/20 absolute inset-y-0"
						style={{ left: `${toX(cue.start)}%`, width: `${toX(cue.end) - toX(cue.start)}%` }}
					/>
				)}
				<Waveform peaks={peaks} version={version} view={view} />
				{cue && (
					<>
						<div
							className="bg-ed absolute inset-y-0 w-0.5 -translate-x-1/2"
							style={{ left: `${toX(cue.start)}%` }}
						>
							<span className="bg-ed absolute top-0 left-0 h-3 w-2 rounded-r-[2px]" />
						</div>
						<div
							className="bg-ed absolute inset-y-0 w-0.5 -translate-x-1/2"
							style={{ left: `${toX(cue.end)}%` }}
						>
							<span className="bg-ed absolute top-0 right-0 h-3 w-2 rounded-l-[2px]" />
						</div>
					</>
				)}
				<PlayheadLine view={view} />
				{(!file || !hasAudio) && (
					<span
						className="text-muted pointer-events-none absolute right-2 bottom-2"
						title={m.subs_no_audio()}
						aria-label={m.subs_no_audio()}
					>
						<AudioLines size={16} aria-hidden="true" />
					</span>
				)}
			</div>
			<ViewScroll view={view} duration={Math.max(length, MIN_SPAN)} onView={setView} controls="subtitle-audio" />
			<div className="flex items-center gap-0.5">
				<IconButton
					label={m.subs_play_before()}
					disabled={!cue}
					onClick={() => {
						if (cue) playRange(Math.max(0, cue.start / 1000 - AROUND), cue.start / 1000);
					}}
				>
					<ChevronFirst size={17} />
				</IconButton>
				<IconButton
					label={m.subs_play_line()}
					disabled={!cue}
					onClick={() => {
						if (cue) playRange(cue.start / 1000, cue.end / 1000);
					}}
				>
					<Play size={16} />
				</IconButton>
				<IconButton
					label={m.subs_play_after()}
					disabled={!cue}
					onClick={() => {
						if (cue) playRange(cue.end / 1000, cue.end / 1000 + AROUND);
					}}
				>
					<ChevronLast size={17} />
				</IconButton>
				<div className="flex-1" />
				<IconButton
					label={m.zoom_out()}
					disabled={span >= length}
					onClick={() => {
						zoom(2);
					}}
				>
					<ZoomOut size={17} />
				</IconButton>
				<IconButton
					label={m.zoom_in()}
					disabled={span <= MIN_SPAN}
					onClick={() => {
						zoom(0.5);
					}}
				>
					<ZoomIn size={17} />
				</IconButton>
			</div>
		</div>
	);
}
