import { useEffect, useRef } from 'react';
import { m } from '@/paraglide/messages.js';
import type { Picture } from './document';
import { pictureBitmap } from './pgs';

/** The picture of a PGS line, on black like on screen: disc subtitles are mostly white. */
export function PicturePreview({ picture }: { picture: Picture }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let current = true;
		void pictureBitmap(picture).then((bitmap) => {
			const canvas = canvasRef.current;
			const context = canvas?.getContext('2d');
			if (!current || !bitmap || !canvas || !context || bitmap.width === 0) return;
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			context.drawImage(bitmap, 0, 0);
		});
		return () => {
			current = false;
		};
	}, [picture]);
	return (
		<canvas
			ref={canvasRef}
			className="min-h-0 w-full flex-1 rounded-xs bg-black object-contain p-2 shadow-[0_0_0_1px_var(--line)]"
			aria-label={m.subs_picture()}
		/>
	);
}

/**
 * The picture of a PGS line at the height of a row of the list, on black, so lines can be told
 * apart at a glance; forced lines say so beside it.
 */
export function PictureThumb({ picture }: { picture: Picture }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		let current = true;
		void pictureBitmap(picture).then((bitmap) => {
			const canvas = canvasRef.current;
			const context = canvas?.getContext('2d');
			if (!current || !bitmap || !canvas || !context || bitmap.width === 0) return;
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			context.drawImage(bitmap, 0, 0);
		});
		return () => {
			current = false;
		};
	}, [picture]);
	return (
		<span className="flex min-w-0 items-center gap-2">
			<canvas
				ref={canvasRef}
				className="h-6 max-w-full min-w-0 rounded-[3px] bg-black object-contain px-1"
				aria-label={picture.forced ? m.subs_picture_forced() : m.subs_picture()}
			/>
			{picture.forced && <span className="text-small text-muted flex-none">{m.subs_forced()}</span>}
		</span>
	);
}
