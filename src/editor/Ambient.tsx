import { useEffect, useRef } from 'react';

/** Side of the canvas drawn, in pixels: blurred this much, more would be wasted. */
const SIDE = 48;

/**
 * Blurs and saturates the picture once, in the small canvas: a CSS blur over the whole stage
 * would be drawn again whenever anything above it changes, costing frames.
 */
export const AMBIENT_FILTER = 'blur(3px) saturate(1.5)';

/** Mean lightness, 0 to 1, the glow is raised to: a dark film still stands out from it. */
const LIGHT = 0.5;
/** At most this much brighter: further, the noise of the dark parts would show. */
const MAX_GAIN = 4;
/** Lightness no part of the glow falls under, so every edge of a dark video shows against it. */
const FLOOR = 0.45;

const lumaOf = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Mean lightness of what the context holds, 0 to 1. */
function lightness(context: CanvasRenderingContext2D): number {
	const { data } = context.getImageData(0, 0, SIDE, SIDE);
	let sum = 0;
	for (let i = 0; i < data.length; i += 4) sum += lumaOf(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
	return sum / (data.length / 4);
}

/**
 * Lifts every part darker than `FLOOR` up to it: what is dim is brightened, what is black takes
 * the picture's mean colour at that lightness, or grey for a black picture.
 */
function liftShadows(context: CanvasRenderingContext2D) {
	const image = context.getImageData(0, 0, SIDE, SIDE);
	const { data } = image;
	const mean = [0, 0, 0];
	for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) mean[c]! += data[i + c] ?? 0;
	const [mr = 0, mg = 0, mb = 0] = mean.map((sum) => sum / (data.length / 4));
	const meanLight = lumaOf(mr, mg, mb);
	// The mean colour at the floor's lightness, kept within what a pixel can hold.
	const tint =
		meanLight > 0.01
			? [mr, mg, mb].map((value) => Math.min(255, (value * FLOOR) / meanLight))
			: [FLOOR * 255, FLOOR * 255, FLOOR * 255];
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i] ?? 0;
		const g = data[i + 1] ?? 0;
		const b = data[i + 2] ?? 0;
		const light = lumaOf(r, g, b);
		if (light >= FLOOR) continue;
		const gain = Math.min(MAX_GAIN, FLOOR / Math.max(light, 1e-3));
		// What the gain leaves short of the floor comes from the tint.
		const rest = 1 - (light * gain) / FLOOR;
		data[i] = Math.min(255, r * gain + (tint[0] ?? 0) * rest);
		data[i + 1] = Math.min(255, g * gain + (tint[1] ?? 0) * rest);
		data[i + 2] = Math.min(255, b * gain + (tint[2] ?? 0) * rest);
	}
	context.putImageData(image, 0, 0);
}

/**
 * The colours of a picture, blurred behind it, as music players show a cover and video apps
 * their ambient light: the stage takes the tone of the file rather than a flat colour.
 */
export function Ambient({ bitmap, className = '' }: { bitmap: ImageBitmap; className?: string }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		canvas.width = SIDE;
		canvas.height = SIDE;
		const scale = Math.max(SIDE / bitmap.width, SIDE / bitmap.height);
		const width = bitmap.width * scale;
		const height = bitmap.height * scale;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) return;
		const draw = (filter: string) => {
			context.clearRect(0, 0, SIDE, SIDE);
			context.filter = filter;
			context.drawImage(bitmap, (SIDE - width) / 2, (SIDE - height) / 2, width, height);
			context.filter = 'none';
		};
		draw(AMBIENT_FILTER);
		// A dark picture is lit up, so the edges of the video still show against its glow.
		const light = lightness(context);
		if (light < LIGHT) draw(`${AMBIENT_FILTER} brightness(${Math.min(MAX_GAIN, LIGHT / Math.max(light, 1e-3))})`);
		liftShadows(context);
	}, [bitmap]);
	return (
		<div
			aria-hidden="true"
			className={`pointer-events-none absolute inset-0 overflow-hidden opacity-45 dark:opacity-40 ${className}`}
		>
			<canvas ref={ref} className="size-full scale-150" />
		</div>
	);
}
