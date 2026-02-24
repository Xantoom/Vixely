import { useRef, useEffect, useMemo, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { usePanZoom } from '@/hooks/usePanZoom.ts';
import { buildFallbackFilterString } from '@/modules/photo-editor/render/fallback-filters.ts';
import { PhotoWebGLRenderer } from '@/modules/photo-editor/render/webgl-renderer.ts';
import { DEFAULT_FILTER_PARAMS } from '@/modules/shared-core/types/filters.ts';
import { useImageEditorStore } from '@/stores/imageEditor.ts';
import { CompareSlider } from './CompareSlider.tsx';
import { CropOverlay } from './CropOverlay.tsx';

interface ImageCanvasProps {
	containerRef: RefObject<HTMLDivElement | null>;
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
		})),
	);

	const filteredCanvasRef = useRef<HTMLCanvasElement>(null);
	const originalCanvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<PhotoWebGLRenderer | null>(null);
	const originalRendererRef = useRef<PhotoWebGLRenderer | null>(null);
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

	// Initialize WebGL renderers
	useEffect(() => {
		const filteredCanvas = filteredCanvasRef.current;
		const originalCanvas = originalCanvasRef.current;
		if (!filteredCanvas || !originalCanvas) return;
		try {
			rendererRef.current = new PhotoWebGLRenderer(filteredCanvas);
			originalRendererRef.current = new PhotoWebGLRenderer(originalCanvas);
			setWebglUnavailable(false);
		} catch {
			rendererRef.current = null;
			originalRendererRef.current = null;
			setWebglUnavailable(true);
			if (!webglErrorNotifiedRef.current) {
				webglErrorNotifiedRef.current = true;
				console.warn('[image] WebGL initialization failed; using compatibility preview mode.');
				toast.error('WebGL unavailable', {
					description: 'Using compatibility preview mode for this browser/device.',
				});
			}
		}

		return () => {
			rendererRef.current?.destroy();
			rendererRef.current = null;
			originalRendererRef.current?.destroy();
			originalRendererRef.current = null;
		};
	}, []);

	// Upload source image when it changes
	useEffect(() => {
		if (!originalData) return;
		if (webglUnavailable) {
			const draw = (canvas: HTMLCanvasElement | null) => {
				if (!canvas) return;
				if (canvas.width !== originalData.width) canvas.width = originalData.width;
				if (canvas.height !== originalData.height) canvas.height = originalData.height;
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.putImageData(originalData, 0, 0);
			};
			draw(filteredCanvasRef.current);
			draw(originalCanvasRef.current);
			return;
		}

		rendererRef.current?.loadImageData(originalData);
		originalRendererRef.current?.loadImageData(originalData);

		// Render original with default filters
		originalRendererRef.current?.render(DEFAULT_FILTER_PARAMS);
	}, [originalData, webglUnavailable]);

	// Render filtered image on every filter change (sub-1ms GPU operation)
	useEffect(() => {
		if (!originalData || !rendererRef.current || webglUnavailable) return;
		rendererRef.current.render(filters);
	}, [originalData, filters, webglUnavailable]);

	const fallbackFilter = useMemo(
		() => (webglUnavailable ? buildFallbackFilterString(filters) : undefined),
		[webglUnavailable, filters],
	);

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
				style={isSplit ? { clipPath: `inset(0 0 0 ${comparePosition * 100}%)` } : undefined}
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
