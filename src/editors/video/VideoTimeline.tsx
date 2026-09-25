import { ChevronsLeftRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keptRanges, outputDuration, restoreCut, setTrim } from '@/document/kept';
import type { Range } from '@/document/timemap';
import { beyond, MIN_VIEW, totalLength } from '@/document/timemap';
import { usePlaybackPeaks, Waveform } from '@/editor/PlaybackWaveform';
import { isVisible, percent, rangeBox, timeAt, zoomView } from '@/editor/timeline-view';
import { TimeRuler } from '@/editor/TimeRuler';
import { TrimHandle } from '@/editor/TrimHandle';
import { ViewScroll } from '@/editor/ViewScroll';
import { formatPreciseTime } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import { Thumbnails } from '@/media/thumbnails';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useBoxSize } from '@/ui/use-box-size';
import { shownCues } from '../subtitles/document';
import { useSubtitleProject } from '../subtitles/project';
import { useSubtitleDoc } from '../subtitles/store';
import type { VideoDoc } from './document';
import { useVideoDoc, useVideoEditor } from './store';

/** Height of the picture lane, in CSS pixels. */
const STRIP_HEIGHT = 48;

/** Pictures along the visible part of the video, one per slot, each the key frame before it. */
function Filmstrip({ file, view, aspect }: { file: File; view: Range; aspect: number }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = useBoxSize(canvasRef);
	const [thumbnails, setThumbnails] = useState<Thumbnails | null>(null);
	const [version, setVersion] = useState(0);

	useEffect(() => {
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const next = new Thumbnails(file, Math.round(STRIP_HEIGHT * ratio));
		next.onChange = () => {
			setVersion((value) => value + 1);
		};
		setThumbnails(next);
		return () => {
			next.dispose();
		};
	}, [file]);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !thumbnails || size.width === 0) return;
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.round(size.width * ratio);
		const height = Math.round(size.height * ratio);
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		context.clearRect(0, 0, width, height);
		const slot = height * aspect;
		const count = Math.ceil(width / slot);
		const span = view.end - view.start;
		// Slots sit on fixed times of the whole video, so scrolling doesn't change the pictures.
		const step = (slot / width) * span;
		const first = Math.floor(view.start / step);
		const times: number[] = [];
		for (let i = 0; i <= count; i++) times.push(Number(((first + i) * step).toFixed(3)));
		thumbnails.want(times);
		for (const time of times) {
			const picture = thumbnails.picture(time);
			if (!picture) continue;
			const x = ((time - view.start) / span) * width;
			context.drawImage(picture, Math.round(x), 0, Math.ceil(slot), height);
		}
	}, [thumbnails, version, view, size, aspect]);

	return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />;
}

/** The lines of the subtitle track shown with the video, as marks along time. */
function CueMarks({ view }: { view: Range }) {
	const doc = useSubtitleDoc();
	const ready = useSubtitleProject((state) => state.status === 'ready' && state.current !== null);
	if (!ready) return null;
	return (
		<>
			{shownCues(doc).map((cue) => {
				const range = { start: cue.start / 1000, end: cue.end / 1000 };
				if (!isVisible(range, view)) return null;
				return (
					<span
						key={cue.id}
						className="bg-subtitles absolute inset-y-0 min-w-0.5 rounded-[2px] opacity-85"
						style={rangeBox(range, view)}
					/>
				);
			})}
		</>
	);
}

function Playhead({ view }: { view: Range }) {
	const time = usePlayback((state) => state.time);
	if (time < view.start || time > view.end) return null;
	return (
		<div
			className="bg-ink pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2"
			style={{ left: percent(time, view) }}
			aria-hidden="true"
		/>
	);
}

/** Handle at one end of the kept video, bound to the video document. */
function VideoTrimHandle({ side, doc, view }: { side: 'start' | 'end'; doc: VideoDoc; view: Range }) {
	const preview = useVideoEditor((state) => state.preview);
	const settle = useVideoEditor((state) => state.settle);
	return (
		<TrimHandle
			label={side === 'start' ? m.trim_handle_start() : m.trim_handle_end()}
			time={doc.trim[side]}
			duration={doc.duration}
			view={view}
			onMove={(time) => {
				preview((current) => setTrim(current, { ...current.trim, [side]: time }));
				// The picture follows the handle, so the cut can be placed on the right frame.
				usePlayback.getState().seek(time);
			}}
			onEnd={settle}
		/>
	);
}

/**
 * The tracks of the video along time, with what is kept, removed and selected. Pressing moves
 * playback there, dragging selects a passage, the handles move the start and the end.
 */
function Lanes({ file, aspect, audio }: { file: File; aspect: number; audio: boolean }) {
	const doc = useVideoDoc();
	const view = useVideoEditor((state) => state.view);
	const selection = useVideoEditor((state) => state.selection);
	const setSelection = useVideoEditor((state) => state.setSelection);
	const apply = useVideoEditor((state) => state.apply);
	const seek = usePlayback((state) => state.seek);
	const { peaks, version } = usePlaybackPeaks();
	const areaRef = useRef<HTMLDivElement>(null);
	const drag = useRef<{ x: number; time: number; moved: boolean } | null>(null);

	// Ctrl or ⌘ + wheel zooms around the pointer; the wheel alone scrolls a zoomed timeline.
	useEffect(() => {
		const area = areaRef.current;
		if (!area) return;
		const onWheel = (event: WheelEvent) => {
			const state = useVideoEditor.getState();
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
	}, []);

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		const time = timeAt(event.currentTarget, event.clientX, view, doc.duration);
		drag.current = { x: event.clientX, time, moved: false };
		seek(time);
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current) return;
		if (!current.moved && Math.abs(event.clientX - current.x) < 4) return;
		current.moved = true;
		const time = timeAt(event.currentTarget, event.clientX, view, doc.duration);
		setSelection({ start: Math.min(current.time, time), end: Math.max(current.time, time) });
	};
	const onPointerUp = () => {
		const current = drag.current;
		drag.current = null;
		if (current && !current.moved) setSelection(null);
	};

	const copied = useVideoEditor((state) => state.copied);
	// What the key frames keep of the passages left out, when the video is copied as it is.
	const kept = copied ? beyond(copied, keptRanges(doc)).filter((range) => isVisible(range, view)) : [];

	const outside = [
		{ start: 0, end: doc.trim.start },
		{ start: doc.trim.end, end: doc.duration },
	].filter((range) => range.end > range.start && isVisible(range, view));

	return (
		<div
			ref={areaRef}
			role="group"
			aria-label={m.timeline_tracks()}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={() => {
				drag.current = null;
			}}
			className="relative grid cursor-text touch-none gap-1 select-none"
		>
			<div
				className="relative overflow-hidden rounded-xs bg-[color-mix(in_srgb,var(--video-1)_16%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--video-1)_35%,transparent)]"
				style={{ height: STRIP_HEIGHT }}
			>
				<Filmstrip file={file} view={view} aspect={aspect} />
			</div>
			{audio && (
				<div className="relative h-9 overflow-hidden rounded-xs bg-[color-mix(in_srgb,var(--audio-1)_12%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--audio-1)_30%,transparent)]">
					{peaks && <Waveform peaks={peaks} version={version} view={view} />}
				</div>
			)}
			<div className="relative h-3 overflow-hidden">
				<CueMarks view={view} />
			</div>

			{outside.map((range) => (
				<div
					key={range.start}
					className="bg-canvas/70 pointer-events-none absolute inset-y-0"
					style={rangeBox(range, view)}
				/>
			))}
			{doc.cuts.map((removed, index) =>
				isVisible(removed, view) ? (
					<div
						key={`${removed.start}-${removed.end}`}
						className="bg-canvas/70 absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--ink)_12%,transparent)_6px_7px)] shadow-[inset_1px_0_0_var(--line-2),inset_-1px_0_0_var(--line-2)]"
						style={rangeBox(removed, view)}
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
			{kept.map((range) => (
				<div
					key={range.start}
					title={m.copy_keyframe_kept()}
					className="absolute inset-y-0 bg-[color-mix(in_srgb,var(--video-1)_22%,transparent)] shadow-[inset_0_2px_0_var(--video-1)]"
					style={rangeBox(range, view)}
				/>
			))}
			{selection && isVisible(selection, view) && (
				<div
					className="bg-ink/10 pointer-events-none absolute inset-y-0 shadow-[inset_1px_0_0_var(--ink),inset_-1px_0_0_var(--ink)]"
					style={rangeBox(selection, view)}
				/>
			)}
			<VideoTrimHandle side="start" doc={doc} view={view} />
			<VideoTrimHandle side="end" doc={doc} view={view} />
			<Playhead view={view} />
		</div>
	);
}

function Toolbar() {
	const doc = useVideoDoc();
	const view = useVideoEditor((state) => state.view);
	const setView = useVideoEditor((state) => state.setView);
	const copied = useVideoEditor((state) => state.copied);
	const time = usePlayback((state) => state.time);
	const span = view.end - view.start;
	// Zoom around the playhead when it is visible, around the middle otherwise.
	const anchor = time >= view.start && time <= view.end ? time : view.start + span / 2;
	return (
		<div className="flex items-center gap-3">
			<span className="text-ui text-muted">{m.video_final_length()}</span>
			<span className="tabular font-mono text-[12.5px]">
				{formatPreciseTime(copied ? totalLength(copied) : outputDuration(doc))}
			</span>
			<div className="flex-1" />
			<div className="flex gap-0.5">
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

/**
 * Timeline of the video editor. It shows the whole source: removed passages stay visible, greyed
 * out, so any edit can be seen and undone.
 */
export function VideoTimeline({ file, aspect, audio }: { file: File; aspect: number; audio: boolean }) {
	const view = useVideoEditor((state) => state.view);
	const duration = useVideoEditor((state) => state.history.present.duration);
	const setView = useVideoEditor((state) => state.setView);
	const seek = usePlayback((state) => state.seek);

	// While playing, the view turns the page when the playhead leaves it.
	useEffect(
		() =>
			usePlayback.subscribe((state, previous) => {
				if (!state.playing || state.time === previous.time) return;
				const current = useVideoEditor.getState().view;
				if (state.time >= current.start && state.time <= current.end) return;
				const span = current.end - current.start;
				useVideoEditor.getState().setView({ start: state.time - span * 0.02, end: state.time + span * 0.98 });
			}),
		[],
	);

	return (
		<section aria-label={m.timeline()} className="border-line grid gap-1.5 border-t px-4 pt-2.5 pb-3">
			<Toolbar />
			<div id="video-timeline" className="grid gap-1">
				<TimeRuler view={view} onSeek={seek} />
				<Lanes file={file} aspect={aspect} audio={audio} />
				<ViewScroll view={view} duration={duration} onView={setView} controls="video-timeline" />
			</div>
		</section>
	);
}
