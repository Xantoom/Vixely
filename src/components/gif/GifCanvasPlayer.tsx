import { memo, useEffect, useRef } from 'react';
import type { DecodedGifFrame } from '@/hooks/useGifDecoder.ts';
import { FilterPipeline } from '@/modules/shared-core/filter-pipeline.ts';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';

interface GifCanvasPlayerProps {
	/** Decoded GIF frames (ImageBitmap + duration) */
	frames: DecodedGifFrame[];
	/** Real-time filter parameters rendered via WebGL */
	filters: FilterParams;
	/** Target output FPS — simulates frame-rate in preview */
	fps: number;
	/** Playback speed multiplier (1 = normal) */
	speed: number;
	/** Play frames in reverse order */
	reverse: boolean;
	/** Natural width of the GIF */
	width: number;
	/** Natural height of the GIF */
	height: number;
	/** CSS style applied to the canvas (transforms only — filters handled by WebGL) */
	style?: React.CSSProperties;
	className?: string;
}

/**
 * Canvas-based GIF frame player with WebGL filter pipeline.
 *
 * All 13 filters (exposure, brightness, contrast, highlights, shadows,
 * saturation, temperature, tint, hue, blur, sepia, vignette, grain)
 * are rendered in real-time via the shared FilterPipeline.
 */
export const GifCanvasPlayer = memo(function GifCanvasPlayer({
	frames,
	filters,
	fps,
	speed,
	reverse,
	width,
	height,
	style,
	className,
}: GifCanvasPlayerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const pipelineRef = useRef<FilterPipeline | null>(null);
	const filtersRef = useRef(filters);
	filtersRef.current = filters;

	// Cleanup pipeline on unmount
	useEffect(() => {
		return () => {
			pipelineRef.current?.destroy();
			pipelineRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (frames.length === 0 || width === 0 || height === 0) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		// Lazily create the WebGL pipeline
		if (!pipelineRef.current) {
			pipelineRef.current = new FilterPipeline(canvas);
		}
		const pipeline = pipelineRef.current;

		const totalFrames = frames.length;
		const effectiveSpeed = Math.max(0.1, speed);
		const targetFps = Math.max(1, fps);

		// Build cumulative timeline from native per-frame durations (ms)
		const cumulativeMs = new Float64Array(totalFrames + 1);
		for (let i = 0; i < totalFrames; i++) {
			cumulativeMs[i + 1] = cumulativeMs[i]! + frames[i]!.durationMs;
		}
		const totalDurationMs = cumulativeMs[totalFrames]!;
		if (totalDurationMs <= 0) return;

		const nativeFps = (totalFrames / totalDurationMs) * 1000;
		const targetIntervalMs = 1000 / targetFps / effectiveSpeed;
		const useNativeTiming = targetFps >= nativeFps;

		let elapsedMs = 0;
		let lastTimestamp = 0;
		let rafId = 0;

		function timeToFrameIndex(timeMs: number): number {
			let t = timeMs % totalDurationMs;
			if (t < 0) t += totalDurationMs;

			let lo = 0;
			let hi = totalFrames - 1;
			while (lo < hi) {
				const mid = (lo + hi) >>> 1;
				if (cumulativeMs[mid + 1]! <= t) {
					lo = mid + 1;
				} else {
					hi = mid;
				}
			}
			return lo;
		}

		const animate = (timestamp: number) => {
			if (lastTimestamp === 0) lastTimestamp = timestamp;

			const dt = timestamp - lastTimestamp;
			lastTimestamp = timestamp;
			elapsedMs += dt * effectiveSpeed;

			// Resolve frame index from timeline
			const timeMs = useNativeTiming ? elapsedMs : Math.floor(elapsedMs / targetIntervalMs) * targetIntervalMs;

			let idx = timeToFrameIndex(timeMs);
			if (reverse) idx = totalFrames - 1 - idx;
			idx = Math.max(0, Math.min(idx, totalFrames - 1));

			const frame = frames[idx];
			if (frame) {
				pipeline.uploadImageBitmap(frame.bitmap);
				pipeline.render(filtersRef.current);
			}

			rafId = requestAnimationFrame(animate);
		};

		rafId = requestAnimationFrame(animate);
		return () => {
			cancelAnimationFrame(rafId);
		};
	}, [frames, fps, speed, reverse, width, height]);

	if (frames.length === 0 || width === 0 || height === 0) return null;

	return <canvas ref={canvasRef} width={width} height={height} style={style} className={className} />;
});
