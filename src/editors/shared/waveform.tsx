import { useEffect, useRef } from "react";
import type { WaveformPeaks } from "~/core/audio";
import { cn } from "~/ui/cn.ts";

export type WaveformProps = {
	peaks: WaveformPeaks | null;
	/** Playhead position in seconds. */
	positionSec: number;
	durationSec: number;
	onSeek: (seconds: number) => void;
	/** Highlighted selection, in seconds. */
	selection?: { readonly startSec: number; readonly endSec: number } | null;
	label: string;
	className?: string;
};

/**
 * Waveform rendered to a canvas.
 *
 * Drawn from precomputed peaks rather than from samples: a one-hour file has
 * hundreds of millions of samples and redrawing from them on every resize would
 * stall the interface.
 */
export function Waveform({
	peaks,
	positionSec,
	durationSec,
	onSeek,
	selection = null,
	label,
	className,
}: WaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (canvas === null || container === null) return;

		const draw = () => {
			// Sized in device pixels: a waveform at CSS resolution is visibly soft
			// on a HiDPI screen, and this is a precision instrument.
			const ratio = globalThis.devicePixelRatio || 1;
			const width = container.clientWidth;
			const height = container.clientHeight;
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);

			const context = canvas.getContext("2d");
			if (context === null) return;
			context.scale(ratio, ratio);
			context.clearRect(0, 0, width, height);

			const styles = getComputedStyle(canvas);
			const accent = styles.getPropertyValue("--accent").trim() || "#8aadf4";
			const muted = styles.getPropertyValue("--text-subtle").trim() || "#6e738d";
			const surface = styles.getPropertyValue("--accent-surface").trim() || "#363a4f";

			const middle = height / 2;

			if (selection !== null && durationSec > 0) {
				context.fillStyle = surface;
				const left = (selection.startSec / durationSec) * width;
				const right = (selection.endSec / durationSec) * width;
				context.fillRect(left, 0, right - left, height);
			}

			if (peaks !== null && peaks.bucketCount > 0) {
				const played = durationSec > 0 ? (positionSec / durationSec) * width : 0;
				const step = width / peaks.bucketCount;

				for (let bucket = 0; bucket < peaks.bucketCount; bucket++) {
					const x = bucket * step;
					const min = peaks.peaks[bucket * 2] ?? 0;
					const max = peaks.peaks[bucket * 2 + 1] ?? 0;
					context.fillStyle = x < played ? accent : muted;
					const top = middle - max * middle;
					const bottom = middle - min * middle;
					context.fillRect(x, top, Math.max(1, step - 0.5), Math.max(1, bottom - top));
				}
			}

			context.strokeStyle = muted;
			context.globalAlpha = 0.4;
			context.beginPath();
			context.moveTo(0, middle);
			context.lineTo(width, middle);
			context.stroke();
			context.globalAlpha = 1;

			if (durationSec > 0) {
				const x = (positionSec / durationSec) * width;
				context.strokeStyle = accent;
				context.lineWidth = 2;
				context.beginPath();
				context.moveTo(x, 0);
				context.lineTo(x, height);
				context.stroke();
			}
		};

		draw();
		const observer = new ResizeObserver(draw);
		observer.observe(container);
		return () => observer.disconnect();
	}, [peaks, positionSec, durationSec, selection]);

	const seekFromEvent = (clientX: number) => {
		const bounds = containerRef.current?.getBoundingClientRect();
		if (bounds === undefined || durationSec <= 0) return;
		const ratio = (clientX - bounds.left) / bounds.width;
		onSeek(Math.min(durationSec, Math.max(0, ratio * durationSec)));
	};

	return (
		<div
			ref={containerRef}
			role="slider"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={Math.round(durationSec)}
			aria-valuenow={Math.round(positionSec)}
			tabIndex={0}
			onPointerDown={(event) => seekFromEvent(event.clientX)}
			onKeyDown={(event) => {
				const step = event.shiftKey ? 10 : 1;
				if (event.key === "ArrowLeft") onSeek(Math.max(0, positionSec - step));
				else if (event.key === "ArrowRight") onSeek(Math.min(durationSec, positionSec + step));
				else if (event.key === "Home") onSeek(0);
				else if (event.key === "End") onSeek(durationSec);
				else return;
				event.preventDefault();
			}}
			className={cn(
				"relative h-full w-full cursor-pointer outline-none",
				"focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
				className,
			)}
		>
			<canvas ref={canvasRef} className="block h-full w-full" />
		</div>
	);
}
