import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';

export interface FrameExtractionOptions {
	file: File;
	targetFps: number;
	maxFrames?: number;
	trimStart?: number;
	trimEnd?: number;
	onProgress?: (extracted: number, total: number) => void;
}

/**
 * Extract VideoFrames from a video file at the target FPS.
 * Returns an array of VideoFrames that the caller must close() when done.
 */
export async function extractFrames(options: FrameExtractionOptions): Promise<VideoFrame[]> {
	const { file, targetFps, maxFrames = 300, trimStart = 0, trimEnd, onProgress } = options;

	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error('No video track found');

		const trackStart = await videoTrack.getFirstTimestamp();
		const trackDuration = await videoTrack.computeDuration();
		const effectiveStart = Math.max(trackStart, trimStart);
		const effectiveEnd = Math.min(trimEnd ?? trackDuration, trackDuration);
		const duration = Math.max(0, effectiveEnd - effectiveStart);
		if (duration <= 0) return [];

		const fps = Math.max(1, targetFps);
		const frameCount = Math.max(1, Math.min(maxFrames, Math.ceil(duration * fps)));
		const timestamps = Array.from({ length: frameCount }, (_, i) => effectiveStart + i / fps);

		const sink = new CanvasSink(videoTrack, { poolSize: 1 });
		const wrappedFrames = await Promise.all(
			timestamps.map(async (timestamp) => {
				return sink.getCanvas(timestamp);
			}),
		);

		const frames: VideoFrame[] = [];
		for (const [index, wrapped] of wrappedFrames.entries()) {
			if (!wrapped) continue;
			const frame = new VideoFrame(wrapped.canvas, {
				timestamp: Math.round(wrapped.timestamp * 1_000_000),
				duration: Math.max(0, Math.round(wrapped.duration * 1_000_000)),
			});
			frames.push(frame);
			onProgress?.(frames.length, frameCount);
			if (index >= maxFrames) break;
		}

		return frames;
	} finally {
		input.dispose();
	}
}
