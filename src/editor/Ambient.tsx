import { useEffect, useRef } from 'react';

/** Side of the canvas drawn, in pixels: blurred this much, more would be wasted. */
const SIDE = 48;

/**
 * Blurs and saturates the picture once, in the small canvas: a CSS blur over the whole stage
 * would be drawn again whenever anything above it changes, costing frames.
 */
export const AMBIENT_FILTER = 'blur(3px) saturate(1.5)';

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
		const context = canvas.getContext('2d');
		if (!context) return;
		context.filter = AMBIENT_FILTER;
		context.drawImage(bitmap, (SIDE - width) / 2, (SIDE - height) / 2, width, height);
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
