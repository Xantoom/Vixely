import { useCallback } from "react";
import { Undo2, Redo2, ZoomOut, ZoomIn, Maximize, MousePointer, Crop, Columns2 } from "lucide-react";
import { useImageEditorStore } from "@/stores/imageEditor.ts";
import { formatDimensions } from "@/utils/format.ts";
import type { ActiveTool, Filters } from "@/stores/imageEditor.ts";

function IconButton({
	onClick,
	disabled,
	active,
	title,
	children,
}: {
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={`h-7 w-7 flex items-center justify-center rounded-md transition-all cursor-pointer
				${active ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text hover:bg-surface-raised/60"}
				${disabled ? "opacity-30 pointer-events-none" : ""}`}
		>
			{children}
		</button>
	);
}

function Separator() {
	return <div className="w-px h-5 bg-border mx-1" />;
}

interface ImageToolbarProps {
	processFn: (data: ImageData, filters: Filters) => Promise<ImageData>;
	containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ImageToolbar({ processFn, containerRef }: ImageToolbarProps) {
	const {
		view, undoStack, redoStack,
		activeTool, crop, originalData,
		compareMode, setCompareMode,
		undo, redo, resetAll,
		setActiveTool, fitToView, zoomTo,
		applyCrop, cancelCrop,
	} = useImageEditorStore();

	const handleUndo = useCallback(() => undo(processFn), [undo, processFn]);
	const handleRedo = useCallback(() => redo(processFn), [redo, processFn]);
	const handleApplyCrop = useCallback(() => applyCrop(), [applyCrop]);

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
		zoomTo(Math.min(10, view.zoom * 1.25), cx, cy);
	}, [view.zoom, zoomTo, containerRef]);

	const handleZoomOut = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		const cx = el.clientWidth / 2;
		const cy = el.clientHeight / 2;
		zoomTo(Math.max(0.1, view.zoom / 1.25), cx, cy);
	}, [view.zoom, zoomTo, containerRef]);

	const handleToolChange = useCallback((tool: ActiveTool) => {
		setActiveTool(tool);
	}, [setActiveTool]);

	const handleToggleCompare = useCallback(() => {
		const next = !compareMode;
		setCompareMode(next);
		if (next) handleFit();
	}, [compareMode, setCompareMode, handleFit]);

	return (
		<div className="h-10 flex items-center px-2 gap-0.5 border-b border-border bg-surface shrink-0 select-none overflow-x-auto">
			{/* Undo / Redo */}
			<IconButton onClick={handleUndo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">
				<Undo2 size={14} />
			</IconButton>
			<IconButton onClick={handleRedo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)">
				<Redo2 size={14} />
			</IconButton>

			<Separator />

			{/* Zoom controls */}
			<IconButton onClick={handleZoomOut} title="Zoom out">
				<ZoomOut size={14} />
			</IconButton>
			<span className="text-[10px] font-mono text-text-tertiary tabular-nums w-10 text-center">
				{Math.round(view.zoom * 100)}%
			</span>
			<IconButton onClick={handleZoomIn} title="Zoom in">
				<ZoomIn size={14} />
			</IconButton>
			<IconButton onClick={handleFit} title="Fit to view">
				<Maximize size={14} />
			</IconButton>

			<Separator />

			{/* Tool select */}
			<IconButton onClick={() => handleToolChange("pointer")} active={activeTool === "pointer"} title="Pointer">
				<MousePointer size={14} />
			</IconButton>
			<IconButton onClick={() => handleToolChange("crop")} active={activeTool === "crop"} title="Crop">
				<Crop size={14} />
			</IconButton>

			<Separator />

			{/* Compare toggle */}
			<IconButton
				onClick={handleToggleCompare}
				active={compareMode}
				disabled={!originalData}
				title="Split compare"
			>
				<Columns2 size={14} />
			</IconButton>

			{/* Crop actions (shown when crop is active with a selection) */}
			{activeTool === "crop" && crop && (
				<>
					<Separator />
					<button
						onClick={handleApplyCrop}
						className="h-6 px-2 rounded-md text-[10px] font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
					>
						Apply
					</button>
					<button
						onClick={cancelCrop}
						className="h-6 px-2 rounded-md text-[10px] font-medium text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
					>
						Cancel
					</button>
				</>
			)}

			{/* Spacer */}
			<div className="flex-1" />

			{/* Dimensions display */}
			{originalData && (
				<span className="text-[10px] font-mono text-text-tertiary tabular-nums mr-2">
					{formatDimensions(originalData.width, originalData.height)}
				</span>
			)}

			{/* Reset all */}
			<button
				onClick={resetAll}
				disabled={!originalData}
				className="h-6 px-2 rounded-md text-[10px] font-medium text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
				title="Reset all changes"
			>
				Reset All
			</button>
		</div>
	);
}
