import { useEffect, useRef } from "react";
import { cn } from "~/ui/cn.ts";

export type SpectrumAnalyzerProps = {
	/** Frequency magnitudes in dB, as produced by an AnalyserNode. */
	data: Float32Array | null;
	label: string;
	className?: string;
};

const MIN_DB = -90;
const MAX_DB = -10;

/**
 * Frequency spectrum, drawn on a logarithmic axis.
 *
 * A linear frequency axis wastes nine tenths of the width on the octave nobody
 * looks at; the log axis is what makes the display readable as music.
 */
export function SpectrumAnalyzer({ data, label, className }: SpectrumAnalyzerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null || data === null) return;

		const ratio = globalThis.devicePixelRatio || 1;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (canvas.width !== Math.round(width * ratio)) {
			canvas.width = Math.round(width * ratio);
			canvas.height = Math.round(height * ratio);
		}

		const context = canvas.getContext("2d");
		if (context === null) return;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);

		const styles = getComputedStyle(canvas);
		const accent = styles.getPropertyValue("--accent").trim() || "#c6a0f6";

		const bars = 64;
		const barWidth = width / bars;

		for (let bar = 0; bar < bars; bar++) {
			// Logarithmic bucket boundaries over the bin range.
			const low = Math.floor(data.length ** (bar / bars)) - 1;
			const high = Math.max(low + 1, Math.floor(data.length ** ((bar + 1) / bars)) - 1);

			let peak = MIN_DB;
			for (let bin = Math.max(0, low); bin < Math.min(data.length, high); bin++) {
				peak = Math.max(peak, data[bin] ?? MIN_DB);
			}

			const normalised = Math.min(1, Math.max(0, (peak - MIN_DB) / (MAX_DB - MIN_DB)));
			const barHeight = normalised * height;

			context.fillStyle = accent;
			context.globalAlpha = 0.35 + normalised * 0.65;
			context.fillRect(bar * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
		}
		context.globalAlpha = 1;
	}, [data]);

	return (
		<canvas
			ref={canvasRef}
			role="img"
			aria-label={label}
			className={cn("block h-full w-full", className)}
		/>
	);
}
