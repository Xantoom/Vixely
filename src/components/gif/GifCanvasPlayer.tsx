import { memo, useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { DecodedGifFrame } from '@/hooks/useGifDecoder.ts';
import { FilterPipeline } from '@/modules/shared-core/filter-pipeline.ts';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';

export interface GifCanvasPlayerHandle {
	/** Step to a specific frame index and render it */
	stepTo: (index: number) => void;
}

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
	/** Pause playback (renders the current frame but stops advancing) */
	paused?: boolean;
	/** Fade in duration in seconds (0 = no fade) */
	fadeInDuration?: number;
	/** Fade out duration in seconds (0 = no fade) */
	fadeOutDuration?: number;
	/** Called on every frame change with the current frame index */
	onFrameChange?: (index: number) => void;
	/** CSS style applied to the canvas (transforms only — filters handled by WebGL) */
	style?: React.CSSProperties;
	className?: string;
}

/**
 * Canvas-based GIF frame player with WebGL filter pipeline.
 *
 * Supports pause, frame stepping (via ref handle), and reports
 * the current frame index via onFrameChange callback.
 */
export const GifCanvasPlayer = memo(
	forwardRef<GifCanvasPlayerHandle, GifCanvasPlayerProps>(function GifCanvasPlayer(
		{
			frames,
			filters,
			fps,
			speed,
			reverse,
			width,
			height,
			paused = false,
			fadeInDuration = 0,
			fadeOutDuration = 0,
			onFrameChange,
			style,
			className,
		},
		ref,
	) {
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const pipelineRef = useRef<FilterPipeline | null>(null);
		const filtersRef = useRef(filters);
		filtersRef.current = filters;
		const onFrameChangeRef = useRef(onFrameChange);
		onFrameChangeRef.current = onFrameChange;
		const [fadeOpacity, setFadeOpacity] = useState(1);
		const hasFade = fadeInDuration > 0 || fadeOutDuration > 0;
		const lastRenderedIndexRef = useRef(-1);

		// Ensure pipeline exists
		const ensurePipeline = useCallback(() => {
			const canvas = canvasRef.current;
			if (!canvas) return null;
			if (!pipelineRef.current) {
				pipelineRef.current = new FilterPipeline(canvas);
			}
			return pipelineRef.current;
		}, []);

		const renderFrame = useCallback(
			(index: number) => {
				const pipeline = ensurePipeline();
				if (!pipeline || frames.length === 0) return;
				const idx = Math.max(0, Math.min(index, frames.length - 1));
				const frame = frames[idx];
				if (!frame) return;
				pipeline.uploadImageBitmap(frame.bitmap);
				pipeline.render(filtersRef.current);
				if (lastRenderedIndexRef.current !== idx) {
					lastRenderedIndexRef.current = idx;
					onFrameChangeRef.current?.(idx);
				}
			},
			[frames, ensurePipeline],
		);

		// Expose stepTo for external frame stepping
		useImperativeHandle(
			ref,
			() => ({
				stepTo: (index: number) => {
					renderFrame(index);
				},
			}),
			[renderFrame],
		);

		// Cleanup pipeline on unmount
		useEffect(() => {
			return () => {
				pipelineRef.current?.destroy();
				pipelineRef.current = null;
			};
		}, []);

		// Re-render current frame when filters change while paused
		useEffect(() => {
			if (!paused || lastRenderedIndexRef.current < 0) return;
			renderFrame(lastRenderedIndexRef.current);
		}, [paused, filters, renderFrame]);

		// Main animation loop
		useEffect(() => {
			if (frames.length === 0 || width === 0 || height === 0) return;

			const canvas = canvasRef.current;
			if (!canvas) return;

			const pipeline = ensurePipeline();
			if (!pipeline) return;

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

			const fadeInMs = fadeInDuration * 1000;
			const fadeOutMs = fadeOutDuration * 1000;

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

				if (!paused) {
					elapsedMs += dt * effectiveSpeed;
				}

				// Resolve frame index from timeline
				const timeMs = useNativeTiming
					? elapsedMs
					: Math.floor(elapsedMs / targetIntervalMs) * targetIntervalMs;

				let idx = timeToFrameIndex(timeMs);
				if (reverse) idx = totalFrames - 1 - idx;
				idx = Math.max(0, Math.min(idx, totalFrames - 1));

				const frame = frames[idx];
				if (frame) {
					pipeline.uploadImageBitmap(frame.bitmap);
					pipeline.render(filtersRef.current);
					if (lastRenderedIndexRef.current !== idx) {
						lastRenderedIndexRef.current = idx;
						onFrameChangeRef.current?.(idx);
					}
				}

				// Compute fade opacity
				if (hasFade) {
					const loopTimeMs = timeMs % totalDurationMs;
					let opacity = 1;
					if (fadeInMs > 0 && loopTimeMs < fadeInMs) {
						opacity = Math.min(opacity, loopTimeMs / fadeInMs);
					}
					if (fadeOutMs > 0 && loopTimeMs > totalDurationMs - fadeOutMs) {
						opacity = Math.min(opacity, (totalDurationMs - loopTimeMs) / fadeOutMs);
					}
					setFadeOpacity(Math.max(0, Math.min(1, opacity)));
				}

				rafId = requestAnimationFrame(animate);
			};

			rafId = requestAnimationFrame(animate);
			return () => {
				cancelAnimationFrame(rafId);
			};
		}, [
			frames,
			fps,
			speed,
			reverse,
			width,
			height,
			paused,
			fadeInDuration,
			fadeOutDuration,
			hasFade,
			ensurePipeline,
		]);

		if (frames.length === 0 || width === 0 || height === 0) return null;

		const baseTransform = style?.transform;
		const flipTransform = baseTransform ? `scaleY(-1) ${baseTransform}` : 'scaleY(-1)';
		const finalStyle: React.CSSProperties = {
			...style,
			transform: flipTransform,
			...(hasFade ? { opacity: fadeOpacity } : {}),
		};

		return <canvas ref={canvasRef} width={width} height={height} style={finalStyle} className={className} />;
	}),
);
