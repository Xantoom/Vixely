import { Undo2, Redo2, ZoomOut, ZoomIn, Maximize, MousePointer, Crop, Columns2, Info } from 'lucide-react';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EditorToolbar } from '@/components/editor/EditorToolbar.tsx';
import { IconButton, ToolbarSeparator } from '@/components/ui/IconButton.tsx';
import type { ActiveTool } from '@/stores/imageEditor.ts';
import { useImageEditorStore } from '@/stores/imageEditor.ts';
import { formatDimensions } from '@/utils/format.ts';

interface ImageToolbarProps {
	containerRef: React.RefObject<HTMLDivElement | null>;
	fileName?: string;
	onShowInfo?: () => void;
}

export function ImageToolbar({ containerRef, fileName, onShowInfo }: ImageToolbarProps) {
	const {
		zoom,
		undoCount,
		redoCount,
		activeTool,
		crop,
		hasOriginal,
		originalWidth,
		originalHeight,
		compareMode,
		setCompareMode,
		undo,
		redo,
		resetAll,
		setActiveTool,
		fitToView,
		zoomTo,
		applyCrop,
		cancelCrop,
	} = useImageEditorStore(
		useShallow((s) => ({
			zoom: s.view.zoom,
			undoCount: s.undoStack.length,
			redoCount: s.redoStack.length,
			activeTool: s.activeTool,
			crop: s.crop,
			hasOriginal: s.originalData != null,
			originalWidth: s.originalData?.width ?? 0,
			originalHeight: s.originalData?.height ?? 0,
			compareMode: s.compareMode,
			setCompareMode: s.setCompareMode,
			undo: s.undo,
			redo: s.redo,
			resetAll: s.resetAll,
			setActiveTool: s.setActiveTool,
			fitToView: s.fitToView,
			zoomTo: s.zoomTo,
			applyCrop: s.applyCrop,
			cancelCrop: s.cancelCrop,
		})),
	);

	const handleApplyCrop = useCallback(() => {
		applyCrop();
	}, [applyCrop]);

	const handleFit = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		fitToView(el.clientWidth, el.clientHeight);
	}, [containerRef, fitToView]);

	const handleZoomIn = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		const cx = el.clientWidth / 2;
		const cy = el.clientHeight / 2;
		zoomTo(Math.min(10, zoom * 1.25), cx, cy);
	}, [zoom, zoomTo, containerRef]);

	const handleZoomOut = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		const cx = el.clientWidth / 2;
		const cy = el.clientHeight / 2;
		zoomTo(Math.max(0.1, zoom / 1.25), cx, cy);
	}, [zoom, zoomTo, containerRef]);

	const handleToolChange = useCallback(
		(tool: ActiveTool) => {
			setActiveTool(tool);
		},
		[setActiveTool],
	);

	const handleToggleCompare = useCallback(() => {
		const next = !compareMode;
		setCompareMode(next);
		if (next) handleFit();
	}, [compareMode, setCompareMode, handleFit]);

	return (
		<EditorToolbar>
			{/* Undo / Redo */}
			<IconButton onClick={undo} disabled={undoCount === 0} title="Undo (Ctrl+Z)">
				<Undo2 size={16} />
			</IconButton>
			<IconButton onClick={redo} disabled={redoCount === 0} title="Redo (Ctrl+Shift+Z)">
				<Redo2 size={16} />
			</IconButton>

			<ToolbarSeparator />

			{/* Zoom controls */}
			<IconButton onClick={handleZoomOut} title="Zoom out">
				<ZoomOut size={16} />
			</IconButton>
			<span className="text-[14px] font-mono text-text-tertiary tabular-nums w-10 text-center">
				{Math.round(zoom * 100)}%
			</span>
			<IconButton onClick={handleZoomIn} title="Zoom in">
				<ZoomIn size={16} />
			</IconButton>
			<IconButton onClick={handleFit} title="Fit to view">
				<Maximize size={16} />
			</IconButton>

			<ToolbarSeparator />

			{/* Tool select */}
			<IconButton
				onClick={() => {
					handleToolChange('pointer');
				}}
				active={activeTool === 'pointer'}
				title="Pointer"
			>
				<MousePointer size={16} />
			</IconButton>
			<IconButton
				onClick={() => {
					handleToolChange('crop');
				}}
				active={activeTool === 'crop'}
				title="Crop"
			>
				<Crop size={16} />
			</IconButton>

			<ToolbarSeparator />

			{/* Compare toggle */}
			<IconButton
				onClick={handleToggleCompare}
				active={compareMode}
				disabled={!hasOriginal}
				title="Split compare"
			>
				<Columns2 size={16} />
			</IconButton>

			{/* Crop actions (shown when crop is active with a selection) */}
			{activeTool === 'crop' && crop && (
				<>
					<ToolbarSeparator />
					<button
						onClick={handleApplyCrop}
						className="h-6 px-2 rounded-md text-[14px] font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
					>
						Apply
					</button>
					<button
						onClick={cancelCrop}
						className="h-6 px-2 rounded-md text-[14px] font-medium text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
					>
						Cancel
					</button>
				</>
			)}

			{/* Spacer */}
			<div className="flex-1" />

			{/* File name + dimensions */}
			{hasOriginal && (
				<div className="hidden sm:flex items-center gap-3 text-[12px] text-text-tertiary font-mono tabular-nums mr-2">
					{fileName && (
						<span className="text-text-secondary font-medium font-sans truncate max-w-40">{fileName}</span>
					)}
					<span>{formatDimensions(originalWidth, originalHeight)}</span>
				</div>
			)}

			{/* Info button */}
			{onShowInfo && (
				<>
					<ToolbarSeparator />
					<IconButton onClick={onShowInfo} title="File info">
						<Info size={16} />
					</IconButton>
				</>
			)}

			<ToolbarSeparator />

			{/* Reset all */}
			<button
				onClick={resetAll}
				disabled={!hasOriginal}
				className="h-6 px-2 rounded-md text-[14px] font-medium text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
				title="Reset all changes"
			>
				Reset All
			</button>
		</EditorToolbar>
	);
}
