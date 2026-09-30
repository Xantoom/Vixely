import { RotateCcw } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keptRanges, restoreCut, setTrim } from '@/document/kept';
import type { Range } from '@/document/timemap';
import { beyond, totalLength } from '@/document/timemap';
import { FitButton } from '@/editor/FitButton';
import type { OverlayEditing } from '@/editor/overlays/editing';
import { LayerLanes } from '@/editor/overlays/LayerLanes';
import { SelectionBar } from '@/editor/SelectionBar';
import { isVisible, percent, rangeBox, timeAt, zoomView } from '@/editor/timeline-view';
import { TimeRuler } from '@/editor/TimeRuler';
import { TrimHandle } from '@/editor/TrimHandle';
import { ViewScroll } from '@/editor/ViewScroll';
import { panDelta, wheelIntent } from '@/editor/wheel';
import { formatPreciseTime } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import { sharedThumbnails, type Thumbnails } from '@/media/thumbnails';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
import { type VideoDoc, videoLength } from './document';
import { useVideoDoc, useVideoEditor } from './store';

/** Height of the picture lane, in CSS pixels. */
const STRIP_HEIGHT = 48;

/** Pictures along the visible part of the video, one per slot, each the key frame before it. */
function Filmstrip({
	file,
	view,
	aspect,
	height: laneHeight,
}: {
	file: File;
	view: Range;
	aspect: number;
	height: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = useBoxSize(canvasRef);
	const [thumbnails, setThumbnails] = useState<Thumbnails | null>(null);
	const [version, setVersion] = useState(0);

	useEffect(() => {
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		// Made once per file: going to another editor and back shows them at once.
		const { thumbnails: shared, release } = sharedThumbnails(file, Math.round(laneHeight * ratio), () => {
			setVersion((value) => value + 1);
		});
		setThumbnails(shared);
		return release;
	}, [file, laneHeight]);

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

function Playhead({ view }: { view: Range }) {
	const time = usePlayback((state) => state.time);
	if (time < view.start || time > view.end) return null;
	return (
		<div
			className="pointer-events-none absolute -top-1 -bottom-1 z-10 w-0.5 -translate-x-1/2 bg-[var(--ed)]"
			style={{ left: percent(time, view) }}
			aria-hidden="true"
		>
			<span className="absolute -top-0.5 left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-[var(--ed)]" />
		</div>
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
 * The video along time, with what is kept and removed. Pressing or dragging moves playback there.
 * While cutting, dragging selects a passage instead, and the handles move the start and the end.
 */
function Lanes({ file, aspect, cutting }: { file: File; aspect: number; cutting: boolean }) {
	const doc = useVideoDoc();
	const view = useVideoEditor((state) => state.view);
	const selection = useVideoEditor((state) => state.selection);
	const setSelection = useVideoEditor((state) => state.setSelection);
	const apply = useVideoEditor((state) => state.apply);
	const seek = usePlayback((state) => state.seek);
	const areaRef = useRef<HTMLDivElement>(null);
	const drag = useRef<{ x: number; time: number; moved: boolean } | null>(null);

	// The wheel zooms around the pointer; Shift + wheel scrolls a zoomed timeline.
	useEffect(() => {
		const area = areaRef.current;
		if (!area) return;
		const onWheel = (event: WheelEvent) => {
			const state = useVideoEditor.getState();
			const current = state.view;
			const duration = state.history.present.duration;
			const span = current.end - current.start;
			if (wheelIntent(event) === 'zoom') {
				event.preventDefault();
				const anchor = timeAt(area, event.clientX, current, duration);
				state.setView(zoomView(current, Math.exp(event.deltaY * 0.0025), anchor));
				return;
			}
			if (span >= duration) return;
			const delta = panDelta(event);
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

	// Out of the trim tool, nothing is left selected to cut.
	useEffect(() => {
		if (!cutting) useVideoEditor.getState().setSelection(null);
	}, [cutting]);

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
		if (cutting) setSelection({ start: Math.min(current.time, time), end: Math.max(current.time, time) });
		else seek(time);
	};
	const onPointerUp = () => {
		const current = drag.current;
		drag.current = null;
		if (current && !current.moved && cutting) setSelection(null);
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
			className={`relative grid touch-none gap-1 select-none ${cutting ? 'cursor-text' : 'cursor-pointer'}`}
		>
			<div
				className="relative overflow-hidden rounded-sm bg-[color-mix(in_srgb,var(--video-1)_16%,var(--bg))]"
				style={{ height: STRIP_HEIGHT }}
			>
				<Filmstrip file={file} view={view} aspect={aspect} height={STRIP_HEIGHT} />
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
						{cutting && (
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
						)}
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
			{selection && isVisible(selection, view) && (
				<SelectionBar
					selection={selection}
					view={view}
					apply={apply}
					onClear={() => {
						setSelection(null);
					}}
				/>
			)}
			{cutting && <VideoTrimHandle side="start" doc={doc} view={view} />}
			{cutting && <VideoTrimHandle side="end" doc={doc} view={view} />}
			<Playhead view={view} />
		</div>
	);
}

/** Back to the whole video, shown only once the timeline is zoomed. */
function VideoFit() {
	const view = useVideoEditor((state) => state.view);
	const duration = useVideoEditor((state) => state.history.present.duration);
	const setView = useVideoEditor((state) => state.setView);
	return (
		<FitButton
			zoomed={view.end - view.start < duration - 1e-3}
			onFit={() => {
				setView({ start: 0, end: duration });
			}}
		/>
	);
}

function FinalLength() {
	const doc = useVideoDoc();
	const copied = useVideoEditor((state) => state.copied);
	return (
		<span className="text-small text-muted flex items-baseline gap-2">
			{m.video_final_length()}
			<span className="tabular text-ink font-medium">
				{formatPreciseTime(copied ? totalLength(copied) : videoLength(doc))}
			</span>
		</span>
	);
}

/**
 * Timeline of the video editor. It shows the whole source: removed passages stay visible, greyed
 * out, so any edit can be seen and undone.
 */
export function VideoTimeline({
	file,
	aspect,
	layers,
	onLayer,
	cutting,
}: {
	file: File;
	aspect: number;
	/** Text, stickers and shapes, each on its own row. */
	layers?: OverlayEditing;
	/** A layer was pressed on its row. */
	onLayer: () => void;
	/** The trim tool is open: passages can be selected and removed, the ends moved. */
	cutting: boolean;
}) {
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
		<section aria-label={m.timeline()} className="border-line grid gap-1 border-t px-4 pt-2 pb-3">
			<div className="flex h-8 items-center gap-3">
				<FinalLength />
				<div className="flex-1" />
				<VideoFit />
			</div>
			<div id="video-timeline" className="grid gap-1">
				<TimeRuler view={view} onSeek={seek} />
				<Lanes file={file} aspect={aspect} cutting={cutting} />
				{layers && <LayerLanes editing={layers} view={view} onSelect={onLayer} />}
				<ViewScroll view={view} duration={duration} onView={setView} controls="video-timeline" />
			</div>
		</section>
	);
}
