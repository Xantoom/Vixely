import { useEffect, useMemo, useRef, useState } from 'react';
import { type OpenedFile, stillImages, useSession } from '@/media/session';
import {
	createGifDoc,
	FRAME_RATES,
	frameKey,
	type GifDoc,
	keptKeys,
	moveFrames,
	type OutputFrame,
	outputFrames,
	outputLength,
} from './document';
import { type FrameSource, openAnimation, openImages, openVideo, type StillImage } from './source';
import { useGifDoc, useGifEditor } from './store';

/** Width a GIF made from a video starts at: wider ones weigh too much for most uses. */
const VIDEO_WIDTH = 480;
/** Frame rate a GIF made from a video starts at: gifski's own default, smooth and light. */
const VIDEO_FPS = 20;
/** Width a GIF made from photos starts at: sharp enough on a screen, still light. */
const IMAGES_WIDTH = 800;

export interface GifEngine {
	source: FrameSource | null;
	/** Frames decoded so far while an animation opens, null once it is ready. */
	reading: number | null;
	failed: boolean;
	/** The frames of the output, as played and exported. */
	frames: OutputFrame[];
	length: number;
	togglePlay: () => void;
	/** Moves the playhead, in output seconds. */
	seek: (time: number) => void;
	/**
	 * Adds still images as frames of their own, after the frame `after` (by key), or at the end.
	 * Only for animations held in memory: GIFs, animated images and images.
	 */
	addImages: (files: File[], after: number | null) => Promise<void>;
}

/**
 * The document once `next` holds the frames `before` ended with, and more after: those new frames
 * are played, right after the frame `after` if given. Frames trimmed off the end stay out.
 */
function withAddedFrames(doc: GifDoc, next: FrameSource, before: number, after: number | null): GifDoc {
	const timing = next.timing ?? [];
	const added = timing.filter((frame) => frame.start >= before - 1e-6).map((frame) => frameKey(frame.start));
	const trimmedOff = timing
		.filter((frame) => frame.start >= doc.trim.end - 1e-6 && frame.start < before - 1e-6)
		.map((frame) => frameKey(frame.start));
	let grown: GifDoc = {
		...doc,
		duration: next.duration,
		trim: { start: doc.trim.start, end: next.duration },
		removed: [...doc.removed, ...trimmedOff],
	};
	const kept = keptKeys(grown, timing);
	const at = after === null ? -1 : kept.indexOf(after);
	if (at >= 0) grown = moveFrames(grown, timing, added, at + 1);
	else if (grown.order) grown = { ...grown, order: [...grown.order.filter((key) => !added.includes(key)), ...added] };
	return grown;
}

/** The fastest standard rate at or under both the target and the source's own rate. */
function startRate(sourceFps: number | null): number {
	const ceiling = Math.min(VIDEO_FPS, sourceFps ?? VIDEO_FPS);
	return FRAME_RATES.toReversed().find((rate) => rate <= ceiling + 0.01) ?? FRAME_RATES[0] ?? 10;
}

/**
 * Opens the pictures of a file, a GIF or a video, and plays the output. Animations keep their own
 * frames and size by default; a video starts at 20 fps and 480 px wide, what most GIFs need.
 */
/**
 * The frames read last, kept when the editor is left: coming back to the same file shows them
 * at once rather than decoding it again. Another file frees them.
 */
let kept: { file: File; batchKey: object | null; source: FrameSource } | null = null;

function keep(file: File, batchKey: object | null, source: FrameSource) {
	if (kept && kept.source !== source) kept.source.dispose();
	kept = { file, batchKey, source };
}

export function useGifEngine(opened: OpenedFile | null, batchKey: object | null): GifEngine {
	const doc = useGifDoc();
	const load = useGifEditor((state) => state.load);
	const retarget = useGifEditor((state) => state.retarget);
	const setPlayhead = useGifEditor((state) => state.setPlayhead);
	const setPlaying = useGifEditor((state) => state.setPlaying);
	const playing = useGifEditor((state) => state.playing);
	const [source, setSource] = useState<FrameSource | null>(null);
	const [reading, setReading] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	const file = opened?.file ?? null;
	const isVideo = Boolean(opened?.info?.video);
	const format = opened?.format ?? '';
	const videoFps = opened?.info?.video?.fps ?? null;
	const images = opened?.images ?? null;
	// The images the source holds, so those added later are read on their own.
	const imageCount = useRef(0);
	const imagesRef = useRef(images);
	imagesRef.current = images;
	// The source shown last, freed when the file changes; and which opening it belongs to.
	const latest = useRef<FrameSource | null>(null);
	const generation = useRef(0);
	// The frame images being added to an animation made from images go after, until they are read.
	const addAfter = useRef<number | null>(null);

	useEffect(() => {
		if (!file) return;
		const controller = new AbortController();
		generation.current += 1;
		setFailed(false);
		setReading(0);
		const still = imagesRef.current;
		const ready = (next: FrameSource) => {
			if (controller.signal.aborted) {
				next.dispose();
				return;
			}
			const fps = next.timing ? null : startRate(next.fps);
			const width = still
				? Math.min(next.width, IMAGES_WIDTH)
				: next.timing
					? null
					: Math.min(next.width, VIDEO_WIDTH);
			const doc = createGifDoc(next.duration, fps);
			// A batch keeps its export settings from file to file; a single file starts afresh.
			if (batchKey && useGifEditor.getState().owner === batchKey) retarget(doc);
			else load(batchKey ?? file, doc, width, !batchKey && !isVideo && format === 'gif');
			latest.current = next;
			setSource(next);
			setReading(null);
		};
		if (still) imageCount.current = still.length;
		// Images added one by one change the source: only a single file's frames are kept.
		const reused = !still && kept?.file === file && kept.batchKey === batchKey ? kept.source : null;
		if (!reused && kept) {
			// Freed once the views have let go of it.
			const stale = kept.source;
			kept = null;
			setTimeout(() => {
				stale.dispose();
			}, 0);
		}
		const open = reused
			? Promise.resolve(reused)
			: still
				? openImages(still, setReading)
				: isVideo
					? openVideo(file, videoFps)
					: openAnimation(file, format, setReading, controller.signal);
		open.then(ready).catch(() => {
			if (!controller.signal.aborted) {
				setFailed(true);
				setReading(null);
			}
		});
		return () => {
			controller.abort();
			generation.current += 1;
			setSource(null);
			// A single file's frames are kept for when the editor comes back to it; images are freed
			// once the views have let go of them, as they still draw them during this render.
			const previous = latest.current;
			latest.current = null;
			if (previous && !imagesRef.current) keep(file, batchKey, previous);
			else
				setTimeout(() => {
					previous?.dispose();
				}, 0);
			setPlaying(false);
		};
	}, [file, isVideo, format, videoFps, batchKey, load, retarget, setPlaying]);

	// Images added: read, then played where asked. The source they join hands its pictures over
	// to the new one.
	const grow = useRef<(from: FrameSource, added: readonly StillImage[], after: number | null) => Promise<void>>(
		async () => {},
	);
	grow.current = async (from, added, after) => {
		if (!from.addImages) return;
		const opening = generation.current;
		const next = await from.addImages(added);
		if (opening !== generation.current) {
			next.dispose();
			return;
		}
		useGifEditor.getState().apply((doc) => withAddedFrames(doc, next, from.duration, after));
		latest.current = next;
		setSource(next);
	};

	// An animation made from images keeps its images in the session, so it opens again whole.
	useEffect(() => {
		if (!source?.addImages || !images || images.length <= imageCount.current) return;
		const added = images.slice(imageCount.current);
		imageCount.current = images.length;
		const after = addAfter.current;
		addAfter.current = null;
		void grow.current(source, added, after);
	}, [source, images]);

	const frames = useMemo(() => (source && doc.duration > 0 ? outputFrames(doc, source.timing) : []), [source, doc]);
	const length = outputLength(frames);

	// Pictures of a video are read ahead, so playback is smooth from the second loop at the latest.
	useEffect(() => {
		source?.prefetch(frames.map((frame) => frame.source));
	}, [source, frames]);

	// Playback loops, like the GIF will.
	useEffect(() => {
		if (!playing || length <= 0) return;
		let last = performance.now();
		let frame = requestAnimationFrame(function tick(now) {
			const { playhead } = useGifEditor.getState();
			setPlayhead((playhead + (now - last) / 1000) % length);
			last = now;
			frame = requestAnimationFrame(tick);
		});
		return () => {
			cancelAnimationFrame(frame);
		};
	}, [playing, length, setPlayhead]);

	return useMemo(
		() => ({
			source,
			reading,
			failed,
			frames,
			length,
			togglePlay: () => {
				setPlaying(!useGifEditor.getState().playing);
			},
			seek: (time: number) => {
				setPlayhead(Math.min(Math.max(0, time), Math.max(0, length - 1e-3)));
			},
			addImages: async (files: File[], after: number | null) => {
				if (!source?.addImages) return;
				setPlaying(false);
				if (imagesRef.current) {
					addAfter.current = after;
					if (!(await useSession.getState().addImages(files))) addAfter.current = null;
					return;
				}
				const { images: added } = await stillImages(files);
				if (added.length > 0) await grow.current(source, added, after);
			},
		}),
		[source, reading, failed, frames, length, setPlaying, setPlayhead],
	);
}
