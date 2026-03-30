import { useRef, useEffect, useMemo, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { usePanZoom } from '@/hooks/usePanZoom.ts';
import { buildFallbackFilterString } from '@/modules/photo-editor/render/fallback-filters.ts';
import { PhotoWebGLRenderer } from '@/modules/photo-editor/render/webgl-renderer.ts';
import { useImageEditorStore } from '@/stores/imageEditor.ts';
import { CompareSlider } from './CompareSlider.tsx';
import { CropOverlay } from './CropOverlay.tsx';

interface ImageCanvasProps {
	containerRef: RefObject<HTMLDivElement | null>;
}

let sharedFilteredRenderer: PhotoWebGLRenderer | null = null;
let sharedSourceData: ImageData | null = null;

function createSharedRenderSurface(): OffscreenCanvas | HTMLCanvasElement {
	if (typeof OffscreenCanvas !== 'undefined') {
		return new OffscreenCanvas(1, 1);
	}
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	return canvas;
}

function getSharedFilteredRenderer(): PhotoWebGLRenderer {
	if (sharedFilteredRenderer) return sharedFilteredRenderer;
	sharedFilteredRenderer = new PhotoWebGLRenderer(createSharedRenderSurface());
	return sharedFilteredRenderer;
}

function drawImageDataToCanvas(canvas: HTMLCanvasElement | null, data: ImageData): void {
	if (!canvas) return;
	if (canvas.width !== data.width) canvas.width = data.width;
	if (canvas.height !== data.height) canvas.height = data.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.putImageData(data, 0, 0);
}

function drawImageSourceToCanvas(
	canvas: HTMLCanvasElement | null,
	source: CanvasImageSource,
	width: number,
	height: number,
): void {
	if (!canvas) return;
	if (canvas.width !== width) canvas.width = width;
	if (canvas.height !== height) canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(source, 0, 0, width, height);
}

export function ImageCanvas({ containerRef }: ImageCanvasProps) {
	const {
		originalData,
		filters,
		showOriginal,
		view,
		setView,
		zoomTo,
		fitToView,
		activeTool,
		compareMode,
		comparePosition,
		resizeWidth,
		resizeHeight,
	} = useImageEditorStore(
		useShallow((s) => ({
			originalData: s.originalData,
			filters: s.filters,
			showOriginal: s.showOriginal,
			view: s.view,
			setView: s.setView,
			zoomTo: s.zoomTo,
			fitToView: s.fitToView,
			activeTool: s.activeTool,
			compareMode: s.compareMode,
			comparePosition: s.comparePosition,
			resizeWidth: s.resizeWidth,
			resizeHeight: s.resizeHeight,
		})),
	);

	const filteredCanvasRef = useRef<HTMLCanvasElement>(null);
	const originalCanvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<PhotoWebGLRenderer | null>(null);
	const filtersRef = useRef(filters);
	const [rendererReadyToken, setRendererReadyToken] = useState(0);
	const webglErrorNotifiedRef = useRef(false);
	const [webglUnavailable, setWebglUnavailable] = useState(false);

	const { getIsPanning } = usePanZoom({
		containerRef,
		view,
		setView,
		zoomTo,
		enabled: activeTool === 'pointer' || activeTool === 'crop',
		leftClickPan: activeTool === 'pointer' && !compareMode,
	});

	// Fit to view on first load / image change
	useEffect(() => {
		if (!originalData || !containerRef.current) return;
		const el = containerRef.current;

		if (el.clientWidth > 0 && el.clientHeight > 0) {
			fitToView(el.clientWidth, el.clientHeight);
		}

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
		return () => {
			ro.disconnect();
		};
	}, [originalData?.width, originalData?.height, fitToView, containerRef]);

	const notifyWebglUnavailable = () => {
		if (webglErrorNotifiedRef.current) return;
		webglErrorNotifiedRef.current = true;
		console.warn('[image] WebGL initialization failed; using compatibility preview mode.');
		toast.error('WebGL unavailable', { description: 'Using compatibility preview mode for this browser/device.' });
	};

	// Keep a single shared renderer across route unmounts/mounts.
	useEffect(() => {
		let cancelled = false;
		let idleId: number | undefined;
		let rafId: number | undefined;

		const initialize = () => {
			if (cancelled) return;
			try {
				rendererRef.current = getSharedFilteredRenderer();
				setWebglUnavailable(false);
				setRendererReadyToken((v) => v + 1);
			} catch {
				rendererRef.current = null;
				setWebglUnavailable(true);
				notifyWebglUnavailable();
			}
		};

		if (sharedFilteredRenderer) {
			initialize();
		} else if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
			idleId = window.requestIdleCallback(
				() => {
					initialize();
				},
				{ timeout: 250 },
			);
		} else {
			rafId = requestAnimationFrame(() => {
				initialize();
			});
		}

		return () => {
			cancelled = true;
			if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
				window.cancelIdleCallback(idleId);
			}
			if (rafId !== undefined) {
				cancelAnimationFrame(rafId);
			}
			rendererRef.current = null;
		};
	}, []);

	const needsOriginalPreview = showOriginal || compareMode;

	useEffect(() => {
		filtersRef.current = filters;
	}, [filters]);

	// Upload source image when it changes
	useEffect(() => {
		if (!originalData) {
			sharedSourceData = null;
			return;
		}

		const renderer = rendererRef.current;
		if (!webglUnavailable && !renderer) {
			// Avoid blank preview while waiting for idle WebGL init.
			drawImageDataToCanvas(filteredCanvasRef.current, originalData);
			if (needsOriginalPreview) drawImageDataToCanvas(originalCanvasRef.current, originalData);
			return;
		}

		if (webglUnavailable) {
			drawImageDataToCanvas(filteredCanvasRef.current, originalData);
			if (needsOriginalPreview) drawImageDataToCanvas(originalCanvasRef.current, originalData);
			return;
		}

		if (!renderer) return;

		// Reuse already-uploaded source texture across route remounts.
		if (sharedSourceData !== originalData) {
			renderer.loadImageData(originalData);
			sharedSourceData = originalData;
		}

		renderer.render(filtersRef.current);
		drawImageSourceToCanvas(filteredCanvasRef.current, renderer.canvas, renderer.width, renderer.height);
		if (needsOriginalPreview) {
			drawImageDataToCanvas(originalCanvasRef.current, originalData);
		}
	}, [originalData, webglUnavailable, needsOriginalPreview, rendererReadyToken]);

	// Render filtered image on every filter change
	useEffect(() => {
		const renderer = rendererRef.current;
		if (!originalData || !renderer || webglUnavailable) return;

		if (sharedSourceData !== originalData) {
			renderer.loadImageData(originalData);
			sharedSourceData = originalData;
		}

		renderer.render(filters);
		drawImageSourceToCanvas(filteredCanvasRef.current, renderer.canvas, renderer.width, renderer.height);
	}, [originalData, filters, webglUnavailable]);

	const fallbackFilter = useMemo(
		() => (webglUnavailable ? buildFallbackFilterString(filters) : undefined),
		[webglUnavailable, filters],
	);

	const imgW = originalData?.width ?? 0;
	const imgH = originalData?.height ?? 0;
	const imgLeft = view.panX;
	const imgScreenW = imgW * view.zoom;

	const transformStyle = {
		transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
		transformOrigin: '0 0' as const,
	};

	const isSplit = compareMode && !showOriginal;
	const pixelated = view.zoom > 2 ? ('pixelated' as const) : ('auto' as const);
	const rawSplitX = imgLeft + comparePosition * imgScreenW;
	const containerWidth = containerRef.current?.clientWidth ?? 0;
	const splitX = containerWidth > 0 ? Math.min(containerWidth, Math.max(0, rawSplitX)) : Math.max(0, rawSplitX);
	const leftSplitClip = `polygon(0 0, ${splitX}px 0, ${splitX}px 100%, 0 100%)`;
	const rightSplitClip = `polygon(${splitX}px 0, 100% 0, 100% 100%, ${splitX}px 100%)`;

	return (
		<>
			{/* Left side wrapper — clips original canvas in split mode */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={isSplit ? { clipPath: leftSplitClip } : undefined}
			>
				<canvas
					ref={originalCanvasRef}
					width={imgW}
					height={imgH}
					className="absolute top-0 left-0"
					style={{
						...transformStyle,
						imageRendering: pixelated,
						display: showOriginal || isSplit ? 'block' : 'none',
					}}
				/>
			</div>

			{/* Right side wrapper — clips filtered canvas in split mode */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={isSplit ? { clipPath: rightSplitClip } : undefined}
			>
				<canvas
					ref={filteredCanvasRef}
					width={imgW}
					height={imgH}
					className="absolute top-0 left-0"
					style={{
						...transformStyle,
						imageRendering: pixelated,
						display: showOriginal ? 'none' : 'block',
						filter: fallbackFilter,
					}}
				/>
			</div>

			{/* Compare slider */}
			{isSplit && <CompareSlider containerRef={containerRef} />}

			{/* "Original" badge */}
			{showOriginal && (
				<div className="absolute top-3 left-3 rounded-md bg-bg/70 px-2.5 py-1 text-[14px] font-medium backdrop-blur-sm z-10">
					Original
				</div>
			)}

			{/* Resize preview overlay — shows target dimensions as dashed outline */}
			{resizeWidth != null &&
				resizeHeight != null &&
				imgW > 0 &&
				imgH > 0 &&
				(resizeWidth !== imgW || resizeHeight !== imgH) && (
					<ResizePreviewOverlay
						view={view}
						originalWidth={imgW}
						originalHeight={imgH}
						targetWidth={resizeWidth}
						targetHeight={resizeHeight}
					/>
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
		</>
	);
}

function ResizePreviewOverlay({
	view,
	originalWidth,
	originalHeight,
	targetWidth,
	targetHeight,
}: {
	view: { panX: number; panY: number; zoom: number };
	originalWidth: number;
	originalHeight: number;
	targetWidth: number;
	targetHeight: number;
}) {
	const scaleX = targetWidth / originalWidth;
	const scaleY = targetHeight / originalHeight;

	// The overlay scales with zoom but positions based on the same transform
	const w = originalWidth * scaleX * view.zoom;
	const h = originalHeight * scaleY * view.zoom;
	const x = view.panX + (originalWidth * view.zoom - w) / 2;
	const y = view.panY + (originalHeight * view.zoom - h) / 2;

	const isUpscale = targetWidth > originalWidth || targetHeight > originalHeight;

	return (
		<div className="absolute inset-0 pointer-events-none z-10">
			<div className="absolute" style={{ left: x, top: y, width: w, height: h }}>
				<svg className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
					<rect
						x="0"
						y="0"
						width="100%"
						height="100%"
						fill="none"
						stroke={isUpscale ? 'rgba(251,191,36,0.7)' : 'rgba(59,130,246,0.7)'}
						strokeWidth="1.5"
						strokeDasharray="6 4"
						style={{ animation: 'marchingAnts 1s linear infinite' }}
					/>
				</svg>
				<div
					className={`absolute -top-6 left-1/2 -translate-x-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-mono tabular-nums whitespace-nowrap ${
						isUpscale
							? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
							: 'bg-accent/15 text-accent border border-accent/20'
					}`}
				>
					{targetWidth} × {targetHeight}
				</div>
			</div>
		</div>
	);
}
