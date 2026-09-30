import { useEffect, useRef } from 'react';

/** Side of the canvas drawn, in pixels: blurred this much, more would be wasted. */
const SIDE = 48;

/**
 * The colours of a picture, blurred behind it, as music players show a cover and video apps
 * their ambient light: the stage takes the tone of the file rather than a flat colour.
 */
export function Ambient({ bitmap }: { bitmap: ImageBitmap }) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		canvas.width = SIDE;
		canvas.height = SIDE;
		const scale = Math.max(SIDE / bitmap.width, SIDE / bitmap.height);
		const width = bitmap.width * scale;
		const height = bitmap.height * scale;
		canvas.getContext('2d')?.drawImage(bitmap, (SIDE - width) / 2, (SIDE - height) / 2, width, height);
	}, [bitmap]);
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 overflow-hidden opacity-45 dark:opacity-40"
		>
			<canvas ref={ref} className="size-full scale-125 blur-3xl saturate-150" />
		</div>
	);
}
