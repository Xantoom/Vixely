import { useEffect, useMemo, useRef } from 'react';
import { m } from '@/paraglide/messages.js';
import { type Adjustments, adjustments, effectiveCrop, type Rect, sameAdjustments } from './document';
import type { PictureEditing } from './editing';
import { lookAdjustments, LOOKS, measureImage } from './looks';
import { ImageRenderer } from './renderer';

/** Side of a thumbnail, in CSS pixels. */
const TILE = 76;

/** Every look as a thumbnail of the picture itself, applied in one click. */
export function LookStrip({ editing }: { editing: PictureEditing }) {
	const { doc, apply, size, still } = editing;
	const stats = useMemo(() => (still ? measureImage(still) : null), [still]);
	const tiles = useMemo(
		() => [
			{ id: 'none', label: m.look_none(), values: adjustments({}) },
			...LOOKS.map((look) => ({ id: look.id, label: look.label(), values: lookAdjustments(look.id, stats) })),
		],
		[stats],
	);
	const canvases = useRef(new Map<string, HTMLCanvasElement>());

	// The thumbnails follow the crop and turns, not the adjustments: those are what the looks replace.
	const crop = effectiveCrop(doc, size);
	const { rotation, flipX, flipY } = doc;
	useEffect(() => {
		if (!still) return;
		const pixels = Math.round(TILE * Math.min(3, window.devicePixelRatio || 1));
		const canvas = new OffscreenCanvas(pixels, pixels);
		let renderer: ImageRenderer;
		try {
			renderer = new ImageRenderer(canvas);
		} catch {
			return;
		}
		renderer.setSource(still);
		// The still may be smaller than the picture the document measures: scale the crop to it.
		const k = still.width / size.width;
		const side = Math.min(crop.width, crop.height);
		const region: Rect = {
			x: (crop.x + (crop.width - side) / 2) * k,
			y: (crop.y + (crop.height - side) / 2) * k,
			width: side * k,
			height: side * k,
		};
		for (const tile of tiles) {
			const target = canvases.current.get(tile.id);
			const context = target?.getContext('2d');
			if (!target || !context) continue;
			renderer.render({ rotation, flipX, flipY, crop: null, adjust: tile.values, overlays: [] }, { region });
			target.width = pixels;
			target.height = pixels;
			context.drawImage(canvas, 0, 0);
		}
		renderer.dispose();
	}, [still, tiles, rotation, flipX, flipY, crop.x, crop.y, crop.width, crop.height, size.width, size.height]);

	const choose = (values: Adjustments) => {
		apply((d) => ({ ...d, adjust: values }));
	};

	return (
		<div
			role="radiogroup"
			aria-label={m.looks()}
			className="-mx-5 flex snap-x scroll-px-5 gap-2.5 overflow-x-auto px-5 pt-0.5 pb-2 [scrollbar-width:thin]"
		>
			{tiles.map((tile) => {
				const selected = sameAdjustments(doc.adjust, tile.values);
				return (
					<button
						key={tile.id}
						type="button"
						role="radio"
						aria-checked={selected}
						onClick={() => {
							choose(tile.values);
						}}
						className="group grid flex-none snap-start justify-items-center gap-1.5"
					>
						<canvas
							ref={(element) => {
								if (element) canvases.current.set(tile.id, element);
								else canvases.current.delete(tile.id);
							}}
							style={{ width: TILE, height: TILE }}
							className="bg-surface ease-spring group-aria-checked:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--ed)] rounded-sm transition-[transform,box-shadow] duration-200 group-hover:scale-[1.04] group-active:scale-[0.97]"
						/>
						<span className="text-small text-ink-2 group-aria-checked:text-ed-text font-medium group-aria-checked:font-semibold">
							{tile.label}
						</span>
					</button>
				);
			})}
		</div>
	);
}
