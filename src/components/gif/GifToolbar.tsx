import { FilePlus2, Info, StepBack, StepForward } from 'lucide-react';
import { EditorToolbar } from '@/components/editor/EditorToolbar.tsx';
import { EditorUxModeSwitch } from '@/components/editor/EditorUxModeSwitch.tsx';
import { IconButton, ToolbarSeparator } from '@/components/ui/IconButton.tsx';
import { formatCompactTime } from '@/components/ui/Timeline.tsx';
import type { EditorUxMode } from '@/stores/editorUx.ts';
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
	editorUxMode: EditorUxMode;
	onEditorUxModeChange: (mode: EditorUxMode) => void;
	onOpenFile: () => void;
	onNew: () => void;
	onStepFrame: (dir: -1 | 1) => void;
	onStartFrameHold: (dir: -1 | 1) => void;
	onStopFrameHold: () => void;
	onShowInfo: () => void;
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
	editorUxMode,
	onEditorUxModeChange,
	onOpenFile,
	onNew,
	onStepFrame,
	onStartFrameHold,
	onStopFrameHold,
	onShowInfo,
}: GifToolbarProps) {
	if (!file) return null;

	return (
		<EditorToolbar>
			{/* Frame step (video source only) */}
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

			{/* Simple / Expert toggle */}
			<div className="hidden sm:block">
				<EditorUxModeSwitch mode={editorUxMode} onChange={onEditorUxModeChange} />
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
