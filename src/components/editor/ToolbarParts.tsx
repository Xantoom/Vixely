import { FilePlus2, Info, LoaderCircle, StepBack, StepForward } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton.tsx';
import { formatNumber } from '@/utils/format.ts';

interface FrameStepGroupProps {
	currentFrame: number;
	totalFrames: number;
	disabled?: boolean;
	onStepFrame: (dir: -1 | 1) => void;
	onStartFrameHold: (dir: -1 | 1) => void;
	onStopFrameHold: () => void;
}

/** Prev frame · counter · next frame, with press-and-hold support. */
export function FrameStepGroup({
	currentFrame,
	totalFrames,
	disabled = false,
	onStepFrame,
	onStartFrameHold,
	onStopFrameHold,
}: FrameStepGroupProps) {
	return (
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
				disabled={disabled}
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
				disabled={disabled}
				title="Next frame"
			>
				<StepForward size={16} />
			</IconButton>
		</>
	);
}

interface FileChooserClusterProps {
	fileName: string;
	onOpenFile: () => void;
	onNew?: () => void;
	onShowInfo?: () => void;
	infoLoading?: boolean;
}

/** File-chooser button + new + info trio, repeated across video/gif/image toolbars. */
export function FileChooserCluster({
	fileName,
	onOpenFile,
	onNew,
	onShowInfo,
	infoLoading = false,
}: FileChooserClusterProps) {
	return (
		<>
			<button
				onClick={onOpenFile}
				className="h-7 max-w-36 rounded-md bg-surface-raised/50 border border-border/60 px-2.5 text-[12px] font-medium text-text-secondary hover:bg-surface-raised hover:text-text transition-colors cursor-pointer truncate"
				title={fileName}
			>
				{fileName}
			</button>
			{onNew && (
				<IconButton onClick={onNew} title="New (discard current)">
					<FilePlus2 size={14} />
				</IconButton>
			)}
			{onShowInfo &&
				(infoLoading ? (
					<span
						className="h-8 w-8 flex items-center justify-center text-text-tertiary"
						title="Loading metadata"
					>
						<LoaderCircle size={14} className="animate-spin" />
					</span>
				) : (
					<IconButton onClick={onShowInfo} title="File info">
						<Info size={16} />
					</IconButton>
				))}
		</>
	);
}
