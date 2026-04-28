import { Columns2 } from 'lucide-react';
import { EditorToolbar } from '@/components/editor/EditorToolbar.tsx';
import { FileChooserCluster, FrameStepGroup } from '@/components/editor/ToolbarParts.tsx';
import { IconButton, ToolbarSeparator } from '@/components/ui/IconButton.tsx';
import { formatCompactTime } from '@/components/ui/Timeline.tsx';

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
			<FrameStepGroup
				currentFrame={currentFrame}
				totalFrames={totalFrames}
				disabled={processing}
				onStepFrame={onStepFrame}
				onStartFrameHold={onStartFrameHold}
				onStopFrameHold={onStopFrameHold}
			/>

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

			<FileChooserCluster
				fileName={file.name}
				onOpenFile={onOpenFile}
				onShowInfo={onShowInfo}
				infoLoading={detailedProbePending}
			/>
		</EditorToolbar>
	);
}
