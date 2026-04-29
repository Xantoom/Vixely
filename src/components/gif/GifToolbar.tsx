import { Columns2, Maximize, Minus, Pause, Play, Plus, StepBack, StepForward } from 'lucide-react';
import { EditorToolbar } from '@/components/editor/EditorToolbar.tsx';
import { FileChooserCluster, FrameStepGroup } from '@/components/editor/ToolbarParts.tsx';
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
	captureMenu?: React.ReactNode;
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
	captureMenu,
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
					<FrameStepGroup
						currentFrame={currentFrame}
						totalFrames={totalFrames}
						disabled={processing}
						onStepFrame={onStepFrame}
						onStartFrameHold={onStartFrameHold}
						onStopFrameHold={onStopFrameHold}
					/>
					<ToolbarSeparator />
				</>
			)}

			{/* Source badge */}
			<span className="rounded-md border border-border/70 bg-bg/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
				{isGifSource ? 'GIF' : 'Video'}
			</span>

			<ToolbarSeparator />

			{/* Capture frame */}
			{captureMenu && (
				<>
					<div className="relative">{captureMenu}</div>
					<ToolbarSeparator />
				</>
			)}

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

			<FileChooserCluster fileName={file.name} onOpenFile={onOpenFile} onNew={onNew} onShowInfo={onShowInfo} />
		</EditorToolbar>
	);
}
