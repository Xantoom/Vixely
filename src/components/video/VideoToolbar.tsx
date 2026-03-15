import { Columns2, FilePlus2, Info, LoaderCircle, StepBack, StepForward } from 'lucide-react';
import { EditorToolbar } from '@/components/editor/EditorToolbar.tsx';
import { EditorUxModeSwitch } from '@/components/editor/EditorUxModeSwitch.tsx';
import { IconButton, ToolbarSeparator } from '@/components/ui/IconButton.tsx';
import { formatCompactTime } from '@/components/ui/Timeline.tsx';
import type { EditorUxMode } from '@/stores/editorUx.ts';
import { formatNumber } from '@/utils/format.ts';

interface VideoToolbarProps {
	file: File | null;
	processing: boolean;
	videoWidth: number | undefined;
	videoHeight: number | undefined;
	videoFps: number;
	duration: number;
	currentTime: number;
	currentFrame: number;
	totalFrames: number;
	detailedProbePending: boolean;
	compareMode: boolean;
	hasChanges: boolean;
	editorUxMode: EditorUxMode;
	onEditorUxModeChange: (mode: EditorUxMode) => void;
	onOpenFile: () => void;
	onStepFrame: (dir: -1 | 1) => void;
	onStartFrameHold: (dir: -1 | 1) => void;
	onStopFrameHold: () => void;
	onShowInfo: () => void;
	onToggleCompare: () => void;
	captureMenu: React.ReactNode;
}

export function VideoToolbar({
	file,
	processing,
	videoWidth,
	videoHeight,
	videoFps,
	duration,
	currentFrame,
	totalFrames,
	detailedProbePending,
	compareMode,
	hasChanges,
	editorUxMode,
	onEditorUxModeChange,
	onOpenFile,
	onStepFrame,
	onStartFrameHold,
	onStopFrameHold,
	onShowInfo,
	onToggleCompare,
	captureMenu,
}: VideoToolbarProps) {
	if (!file) return null;

	return (
		<EditorToolbar>
			{/* Frame step back */}
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
				disabled={!file || processing}
				title="Previous frame"
			>
				<StepBack size={16} />
			</IconButton>

			{/* Frame counter */}
			<span className="text-[12px] font-mono text-text-tertiary tabular-nums px-1.5">
				{formatNumber(currentFrame)} / {formatNumber(totalFrames)}
			</span>

			{/* Frame step forward */}
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
				disabled={!file || processing}
				title="Next frame"
			>
				<StepForward size={16} />
			</IconButton>

			<ToolbarSeparator />

			{/* Capture frame */}
			<div className="relative">{captureMenu}</div>

			<ToolbarSeparator />

			{/* Compare toggle */}
			<IconButton onClick={onToggleCompare} active={compareMode} disabled={!hasChanges} title="Split compare">
				<Columns2 size={16} />
			</IconButton>

			{/* Spacer */}
			<div className="flex-1" />

			{/* File metadata summary */}
			<div className="hidden sm:flex items-center gap-3 text-[12px] text-text-tertiary font-mono tabular-nums">
				{videoWidth && videoHeight && (
					<span>
						{videoWidth}&times;{videoHeight}
					</span>
				)}
				<span>{videoFps.toFixed(2)} fps</span>
				<span>{formatCompactTime(duration)}</span>
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
			<IconButton onClick={onOpenFile} title="Open new file">
				<FilePlus2 size={14} />
			</IconButton>

			<ToolbarSeparator />

			{/* Info button */}
			{detailedProbePending ? (
				<span className="h-8 w-8 flex items-center justify-center text-text-tertiary" title="Loading metadata">
					<LoaderCircle size={14} className="animate-spin" />
				</span>
			) : (
				<IconButton onClick={onShowInfo} title="File info">
					<Info size={16} />
				</IconButton>
			)}
		</EditorToolbar>
	);
}
