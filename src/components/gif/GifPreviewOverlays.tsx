import { memo, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { GifCropOverlay } from './GifCropOverlay.tsx';

interface GifPreviewOverlaysProps {
	sourceWidth: number;
	sourceHeight: number;
}

/**
 * Real-time visual overlays rendered on top of the GIF/video preview.
 * Handles: crop mask, text overlays, image overlay, and aspect-ratio padding indicator.
 */
export const GifPreviewOverlays = memo(function GifPreviewOverlays({
	sourceWidth,
	sourceHeight,
}: GifPreviewOverlaysProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	const { crop, textOverlays, imageOverlay, aspectPreset, aspectPaddingColor } = useGifEditorStore(
		useShallow((s) => ({
			crop: s.crop,
			textOverlays: s.textOverlays,
			imageOverlay: s.imageOverlay,
			aspectPreset: s.aspectPreset,
			aspectPaddingColor: s.aspectPaddingColor,
		})),
	);

	// Track container dimensions to compute pixel scale
	useEffect(() => {
		const el = overlayRef.current;
		if (!el || sourceWidth <= 0) return;
		const ro = new ResizeObserver(([entry]) => {
			if (entry) {
				setScale(entry.contentRect.width / sourceWidth);
			}
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
		};
	}, [sourceWidth]);

	const hasOverlays = crop || textOverlays.length > 0 || imageOverlay.url || aspectPreset !== 'free';
	if (!hasOverlays) {
		// Still need the ref for ResizeObserver to be ready when overlays appear
		return <div ref={overlayRef} className="absolute inset-0 pointer-events-none" />;
	}

	return (
		<div ref={overlayRef} className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
			{/* ── Interactive crop overlay ── */}
			{crop && <GifCropOverlay sourceWidth={sourceWidth} sourceHeight={sourceHeight} />}

			{/* ── Text overlays ── */}
			{textOverlays.map((overlay) => (
				<div
					key={overlay.id}
					className="absolute whitespace-pre z-20"
					style={{
						left: `${overlay.x}%`,
						top: `${overlay.y}%`,
						transform: 'translate(-50%, -50%)',
						fontSize: `${overlay.fontSize * scale}px`,
						lineHeight: 1.2,
						fontFamily: overlay.fontFamily,
						color: overlay.color,
						opacity: overlay.opacity,
						WebkitTextStroke:
							overlay.outlineWidth > 0
								? `${Math.max(1, overlay.outlineWidth * scale)}px ${overlay.outlineColor}`
								: undefined,
						paintOrder: 'stroke fill',
						textShadow:
							overlay.outlineWidth > 0
								? `0 0 ${Math.max(1, overlay.outlineWidth * scale)}px ${overlay.outlineColor}`
								: undefined,
					}}
				>
					{overlay.text}
				</div>
			))}

			{/* ── Image overlay ── */}
			{imageOverlay.url && (
				<ImageOverlayPreview
					url={imageOverlay.url}
					x={imageOverlay.x}
					y={imageOverlay.y}
					width={imageOverlay.width}
					height={imageOverlay.height}
					opacity={imageOverlay.opacity}
					sourceWidth={sourceWidth}
					sourceHeight={sourceHeight}
					scale={scale}
				/>
			)}

			{/* ── Aspect ratio padding indicator ── */}
			{aspectPreset !== 'free' && (
				<AspectRatioBars
					aspectPreset={aspectPreset}
					paddingColor={aspectPaddingColor}
					sourceWidth={sourceWidth}
					sourceHeight={sourceHeight}
				/>
			)}
		</div>
	);
});

/* ── Image Overlay ── */

const ASPECT_RATIO_MAP: Record<string, number> = {
	'1:1': 1,
	'4:3': 4 / 3,
	'16:9': 16 / 9,
	'3:2': 3 / 2,
	'9:16': 9 / 16,
	'21:9': 21 / 9,
};

interface ImageOverlayPreviewProps {
	url: string;
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
	sourceWidth: number;
	sourceHeight: number;
	scale: number;
}

/**
 * Resolve special position values:
 * - Positive = pixel offset from left/top
 * - -1 = align to right/bottom edge
 * - -2 = center
 */
function resolveOverlayPosition(pos: number, overlaySize: number, sourceSize: number): number {
	if (pos === -2) return (sourceSize - overlaySize) / 2;
	if (pos === -1) return sourceSize - overlaySize;
	return pos;
}

const ImageOverlayPreview = memo(function ImageOverlayPreview({
	url,
	x,
	y,
	width,
	height,
	opacity,
	sourceWidth,
	sourceHeight,
	scale,
}: ImageOverlayPreviewProps) {
	const resolvedX = resolveOverlayPosition(x, width, sourceWidth);
	const resolvedY = resolveOverlayPosition(y, height, sourceHeight);

	return (
		<img
			src={url}
			alt=""
			className="absolute z-20"
			style={{
				left: `${(resolvedX / sourceWidth) * 100}%`,
				top: `${(resolvedY / sourceHeight) * 100}%`,
				width: `${width * scale}px`,
				height: `${height * scale}px`,
				opacity,
				objectFit: 'contain',
			}}
		/>
	);
});

/* ── Aspect Ratio Bars ── */

interface AspectRatioBarsProps {
	aspectPreset: string;
	paddingColor: string;
	sourceWidth: number;
	sourceHeight: number;
}

const AspectRatioBars = memo(function AspectRatioBars({
	aspectPreset,
	paddingColor,
	sourceWidth,
	sourceHeight,
}: AspectRatioBarsProps) {
	const targetRatio = ASPECT_RATIO_MAP[aspectPreset];
	if (!targetRatio || sourceWidth <= 0 || sourceHeight <= 0) return null;

	const srcRatio = sourceWidth / sourceHeight;

	// No padding needed if ratios match
	if (Math.abs(srcRatio - targetRatio) < 0.01) return null;

	if (srcRatio > targetRatio) {
		// Source is wider → letterbox (top/bottom padding)
		const paddedHeight = sourceWidth / targetRatio;
		const padPerSide = (paddedHeight - sourceHeight) / 2;
		// Show as percentage of source image height
		const barPct = (padPerSide / sourceHeight) * 100;
		return (
			<>
				<div
					className="absolute left-0 right-0 top-0 z-10 flex items-center justify-center"
					style={{ height: `${Math.min(barPct, 25)}%`, backgroundColor: paddingColor, opacity: 0.7 }}
				>
					<span className="text-[10px] font-medium opacity-70" style={{ color: invertColor(paddingColor) }}>
						Letterbox
					</span>
				</div>
				<div
					className="absolute left-0 right-0 bottom-0 z-10 flex items-center justify-center"
					style={{ height: `${Math.min(barPct, 25)}%`, backgroundColor: paddingColor, opacity: 0.7 }}
				>
					<span className="text-[10px] font-medium opacity-70" style={{ color: invertColor(paddingColor) }}>
						Letterbox
					</span>
				</div>
			</>
		);
	}

	// Source is taller → pillarbox (left/right padding)
	const paddedWidth = sourceHeight * targetRatio;
	const padPerSide = (paddedWidth - sourceWidth) / 2;
	const barPct = (padPerSide / sourceWidth) * 100;
	return (
		<>
			<div
				className="absolute top-0 bottom-0 left-0 z-10 flex items-center justify-center"
				style={{ width: `${Math.min(barPct, 25)}%`, backgroundColor: paddingColor, opacity: 0.7 }}
			>
				<span
					className="text-[10px] font-medium opacity-70 [writing-mode:vertical-rl]"
					style={{ color: invertColor(paddingColor) }}
				>
					Pillarbox
				</span>
			</div>
			<div
				className="absolute top-0 bottom-0 right-0 z-10 flex items-center justify-center"
				style={{ width: `${Math.min(barPct, 25)}%`, backgroundColor: paddingColor, opacity: 0.7 }}
			>
				<span
					className="text-[10px] font-medium opacity-70 [writing-mode:vertical-rl]"
					style={{ color: invertColor(paddingColor) }}
				>
					Pillarbox
				</span>
			</div>
		</>
	);
});

/** Simple contrast color for label readability */
function invertColor(hex: string): string {
	const c = hex.replace('#', '');
	const r = parseInt(c.substring(0, 2), 16);
	const g = parseInt(c.substring(2, 4), 16);
	const b = parseInt(c.substring(4, 6), 16);
	const luminance = (r * 299 + g * 587 + b * 114) / 1000;
	return luminance > 128 ? '#000000' : '#ffffff';
}
