import { Info, LoaderCircle, StepBack, StepForward } from 'lucide-react';
import { EditorToolbar } from '@/components/editor/EditorToolbar.tsx';
import { IconButton, ToolbarSeparator } from '@/components/ui/IconButton.tsx';
import { formatCompactTime } from '@/components/ui/Timeline.tsx';
import { formatFileSize, formatNumber } from '@/utils/format.ts';

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
	onStepFrame: (dir: -1 | 1) => void;
	onStartFrameHold: (dir: -1 | 1) => void;
	onStopFrameHold: () => void;
	onShowInfo: () => void;
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
	onStepFrame,
	onStartFrameHold,
	onStopFrameHold,
	onShowInfo,
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

			{/* Spacer */}
			<div className="flex-1" />

			{/* File metadata summary */}
			<div className="hidden sm:flex items-center gap-3 text-[12px] text-text-tertiary font-mono tabular-nums">
				<span className="text-text-secondary font-medium font-sans truncate max-w-40">{file.name}</span>
				<span>{formatFileSize(file.size)}</span>
				{videoWidth && videoHeight && (
					<span>
						{videoWidth}&times;{videoHeight}
					</span>
				)}
				<span>{videoFps.toFixed(2)} fps</span>
				<span>{formatCompactTime(duration)}</span>
			</div>

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
