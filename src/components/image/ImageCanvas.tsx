import { useRef, useEffect, useMemo, type RefObject } from 'react';
import { usePanZoom } from '@/hooks/usePanZoom.ts';
import { useImageEditorStore } from '@/stores/imageEditor.ts';
import { CompareSlider } from './CompareSlider.tsx';
import { CropOverlay } from './CropOverlay.tsx';

interface ImageCanvasProps {
	containerRef: RefObject<HTMLDivElement | null>;
}

/** Generate a 256x256 noise tile as a data URL (once on mount). */
function generateGrainTile(): string {
	const size = 256;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const img = ctx.createImageData(size, size);
	const d = img.data;
	for (let i = 0; i < d.length; i += 4) {
		const v = Math.random() * 255;
		d[i] = v;
		d[i + 1] = v;
		d[i + 2] = v;
		d[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	return canvas.toDataURL();
}

export function ImageCanvas({ containerRef }: ImageCanvasProps) {
	const {
		originalData,
		filteredData,
		filters,
		isDraggingSlider,
		isProcessing,
		showOriginal,
		view,
		setView,
		zoomTo,
		fitToView,
		activeTool,
		compareMode,
		comparePosition,
	} = useImageEditorStore();

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const originalCanvasRef = useRef<HTMLCanvasElement>(null);
	const grainTileRef = useRef<string | null>(null);

	// Generate grain tile once
	if (!grainTileRef.current) {
		grainTileRef.current = generateGrainTile();
	}

	const { getIsPanning } = usePanZoom({
		containerRef,
		view,
		setView,
		zoomTo,
		enabled: activeTool === 'pointer' || activeTool === 'crop',
		leftClickPan: activeTool === 'pointer' && !compareMode,
	});

	/* ── Fit to view on first load / image change ── */
	useEffect(() => {
		if (!originalData || !containerRef.current) return;
		const el = containerRef.current;

		// Fit immediately if container already has dimensions
		if (el.clientWidth > 0 && el.clientHeight > 0) {
			fitToView(el.clientWidth, el.clientHeight);
		}

		// Also observe for resize so fitToView works on first layout
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width, height } = entry.contentRect;
			if (width > 0 && height > 0) {
				fitToView(width, height);
				ro.disconnect();
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [originalData?.width, originalData?.height, fitToView, containerRef]);

	/* ── Draw original canvas (for Compare) ── */
	useEffect(() => {
		if (!originalData) return;
		const c = originalCanvasRef.current;
		if (!c) return;
		c.width = originalData.width;
		c.height = originalData.height;
		const ctx = c.getContext('2d')!;
		ctx.putImageData(originalData, 0, 0);
	}, [originalData]);

	/* ── Draw filtered canvas ── */
	useEffect(() => {
		const c = canvasRef.current;
		if (!c) return;

		// During slider drag, show originalData (CSS filter handles preview)
		const source = isDraggingSlider ? originalData : filteredData;
		if (!source) return;

		c.width = source.width;
		c.height = source.height;
		const ctx = c.getContext('2d')!;
		ctx.putImageData(source, 0, 0);
	}, [originalData, filteredData, isDraggingSlider]);

	/* ── CSS filter for live 60fps preview during slider drag ── */
	const cssFilter = useMemo(() => {
		if (!isDraggingSlider) return 'none';
		const { exposure, brightness, contrast, saturation, hue, blur, sepia } = filters;
		return `brightness(${exposure * (1 + brightness * 2)}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg) blur(${blur}px) sepia(${sepia})`;
	}, [isDraggingSlider, filters]);

	const imgW = originalData?.width ?? 0;
	const imgH = originalData?.height ?? 0;

	const transformStyle = {
		transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
		transformOrigin: '0 0' as const,
	};

	const isSplit = compareMode && !showOriginal;
	const pixelated = view.zoom > 2 ? ('pixelated' as const) : ('auto' as const);

	return (
		<>
			{/* Left side wrapper — clips original canvas in split mode */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={isSplit ? { clipPath: `inset(0 ${(1 - comparePosition) * 100}% 0 0)` } : undefined}
			>
				<canvas
					ref={originalCanvasRef}
					className="absolute top-0 left-0"
					style={{
						...transformStyle,
						imageRendering: pixelated,
						display: showOriginal || isSplit ? 'block' : 'none',
					}}
				/>
			</div>

			{/* Right side wrapper — clips filtered canvas + overlays in split mode */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={isSplit ? { clipPath: `inset(0 0 0 ${comparePosition * 100}%)` } : undefined}
			>
				<canvas
					ref={canvasRef}
					className="absolute top-0 left-0"
					style={{
						...transformStyle,
						filter: cssFilter,
						imageRendering: pixelated,
						display: showOriginal ? 'none' : 'block',
					}}
				/>

				{/* Vignette overlay */}
				{!showOriginal && filters.vignette > 0 && imgW > 0 && (
					<div
						className="absolute top-0 left-0 pointer-events-none"
						style={{
							...transformStyle,
							width: imgW,
							height: imgH,
							background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${filters.vignette}) 100%)`,
						}}
					/>
				)}

				{/* Grain overlay */}
				{!showOriginal && filters.grain > 0 && imgW > 0 && grainTileRef.current && (
					<div
						className="absolute top-0 left-0 pointer-events-none"
						style={{
							...transformStyle,
							width: imgW,
							height: imgH,
							backgroundImage: `url(${grainTileRef.current})`,
							backgroundRepeat: 'repeat',
							mixBlendMode: 'overlay',
							opacity: (filters.grain / 100) * 0.4,
						}}
					/>
				)}
			</div>

			{/* Compare slider */}
			{isSplit && <CompareSlider containerRef={containerRef} />}

			{/* "Original" badge */}
			{showOriginal && (
				<div className="absolute top-3 left-3 rounded-md bg-bg/70 px-2.5 py-1 text-[13px] font-medium backdrop-blur-sm z-10">
					Original
				</div>
			)}

			{/* Crop overlay */}
			{activeTool === 'crop' && (
				<CropOverlay
					containerRef={containerRef}
					view={view}
					imageWidth={imgW}
					imageHeight={imgH}
					getIsPanning={getIsPanning}
				/>
			)}

			{/* Processing indicator */}
			{isProcessing && (
				<div className="absolute top-3 right-3 rounded-md bg-bg/80 px-2.5 py-1.5 text-[13px] font-medium backdrop-blur-sm z-10 flex items-center gap-2">
					<div className="h-3 w-3 rounded-full border-2 border-border border-t-accent animate-spin" />
					Processing...
				</div>
			)}
		</>
	);
}
