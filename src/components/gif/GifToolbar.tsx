import { Columns2, FilePlus2, Info, Maximize, Minus, Pause, Play, Plus, StepBack, StepForward } from 'lucide-react';
import { EditorToolbar } from '@/components/editor/EditorToolbar.tsx';
import { IconButton, ToolbarSeparator } from '@/components/ui/IconButton.tsx';
import { formatCompactTime } from '@/components/ui/Timeline.tsx';
import { formatFileSize, formatNumber } from '@/utils/format.ts';

interface GifToolbarProps {
	file: File | null;
	processing: boolean;
	sourceWidth: number | null;
	sourceHeight: number | null;
	duration: number;
	currentFrame: number;
	totalFrames: number;
	isGifSource: boolean;
	gifPaused: boolean;
	onToggleGifPause: () => void;
	onGifStepFrame: (dir: -1 | 1) => void;
	onOpenFile: () => void;
	onNew: () => void;
	onStepFrame: (dir: -1 | 1) => void;
	onStartFrameHold: (dir: -1 | 1) => void;
	onStopFrameHold: () => void;
	onShowInfo: () => void;
	compareMode: boolean;
	hasChanges: boolean;
	onToggleCompare: () => void;
	zoom: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onFitToScreen: () => void;
}

export function GifToolbar({
	file,
	processing,
	sourceWidth,
	sourceHeight,
	duration,
	currentFrame,
	totalFrames,
	isGifSource,
	gifPaused,
	onToggleGifPause,
	onGifStepFrame,
	onOpenFile,
	onNew,
	onStepFrame,
	onStartFrameHold,
	onStopFrameHold,
	onShowInfo,
	compareMode,
	hasChanges,
	onToggleCompare,
	zoom,
	onZoomIn,
	onZoomOut,
	onFitToScreen,
}: GifToolbarProps) {
	if (!file) return null;

	return (
		<EditorToolbar>
			{/* ── GIF source playback controls ── */}
			{isGifSource && totalFrames > 0 && (
				<>
					<IconButton
						onClick={() => {
							onGifStepFrame(-1);
						}}
						disabled={processing}
						title="Previous frame"
					>
						<StepBack size={16} />
					</IconButton>

					<IconButton onClick={onToggleGifPause} disabled={processing} title={gifPaused ? 'Play' : 'Pause'}>
						{gifPaused ? <Play size={16} /> : <Pause size={16} />}
					</IconButton>

					<span className="text-[12px] font-mono text-text-tertiary tabular-nums px-1">
						{formatNumber(currentFrame + 1)} / {formatNumber(totalFrames)}
					</span>

					<IconButton
						onClick={() => {
							onGifStepFrame(1);
						}}
						disabled={processing}
						title="Next frame"
					>
						<StepForward size={16} />
					</IconButton>

					<ToolbarSeparator />
				</>
			)}

			{/* ── Video source frame step ── */}
			{!isGifSource && (
				<>
					<IconButton
						onClick={() => {
							onStepFrame(-1);
						}}
						onPointerDown={(e) => {
							e.preventDefault();
							onStartFrameHold(-1);
						}}
						onPointerUp={onStopFrameHold}
						onPointerLeave={onStopFrameHold}
						onPointerCancel={onStopFrameHold}
						disabled={processing}
						title="Previous frame"
					>
						<StepBack size={16} />
					</IconButton>

					<span className="text-[12px] font-mono text-text-tertiary tabular-nums px-1.5">
						{formatNumber(currentFrame)} / {formatNumber(totalFrames)}
					</span>

					<IconButton
						onClick={() => {
							onStepFrame(1);
						}}
						onPointerDown={(e) => {
							e.preventDefault();
							onStartFrameHold(1);
						}}
						onPointerUp={onStopFrameHold}
						onPointerLeave={onStopFrameHold}
						onPointerCancel={onStopFrameHold}
						disabled={processing}
						title="Next frame"
					>
						<StepForward size={16} />
					</IconButton>

					<ToolbarSeparator />
				</>
			)}

			{/* Source badge */}
			<span className="rounded-md border border-border/70 bg-bg/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
				{isGifSource ? 'GIF' : 'Video'}
			</span>

			<ToolbarSeparator />

			{/* Compare toggle */}
			<IconButton onClick={onToggleCompare} active={compareMode} disabled={!hasChanges} title="Split compare">
				<Columns2 size={16} />
			</IconButton>

			<ToolbarSeparator />

			{/* Zoom controls */}
			<IconButton onClick={onZoomOut} disabled={zoom <= 0.1} title="Zoom out">
				<Minus size={16} />
			</IconButton>

			<button
				onClick={onFitToScreen}
				className="h-7 min-w-[3.5rem] rounded-md px-1.5 text-[12px] font-mono tabular-nums text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				title="Fit to screen"
			>
				{Math.round(zoom * 100)}%
			</button>

			<IconButton onClick={onZoomIn} disabled={zoom >= 10} title="Zoom in">
				<Plus size={16} />
			</IconButton>

			<IconButton onClick={onFitToScreen} title="Fit to screen">
				<Maximize size={16} />
			</IconButton>

			{/* Spacer */}
			<div className="flex-1" />

			{/* File metadata summary */}
			<div className="hidden sm:flex items-center gap-3 text-[12px] text-text-tertiary font-mono tabular-nums">
				<span>{formatFileSize(file.size)}</span>
				{sourceWidth && sourceHeight && (
					<span>
						{sourceWidth}&times;{sourceHeight}
					</span>
				)}
				{duration > 0 && <span>{formatCompactTime(duration)}</span>}
			</div>

			<ToolbarSeparator />

			{/* File chooser */}
			<button
				onClick={onOpenFile}
				className="h-7 max-w-36 rounded-md bg-surface-raised/50 border border-border/60 px-2.5 text-[12px] font-medium text-text-secondary hover:bg-surface-raised hover:text-text transition-colors cursor-pointer truncate"
				title={file.name}
			>
				{file.name}
			</button>
			<IconButton onClick={onNew} title="New (discard current)">
				<FilePlus2 size={14} />
			</IconButton>

			<ToolbarSeparator />

			{/* Info button */}
			<IconButton onClick={onShowInfo} title="File info">
				<Info size={16} />
			</IconButton>
		</EditorToolbar>
	);
}
