import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/index.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { formatFileSize, formatNumber } from '@/utils/format.ts';

interface GifExportPanelProps {
	file: File | null;
	ready: boolean;
	processing: boolean;
	progress: number;
	error: string | null;
	estimatedFrames: number;
	clipDuration: number;
	width: number;
	outputHeight: number;
	resultUrl: string | null;
	resultSize: number;
	onGenerate: () => void;
	onDownload: () => void;
}

export function GifExportPanel({
	file,
	ready,
	processing,
	progress,
	error,
	estimatedFrames,
	clipDuration,
	width,
	outputHeight,
	resultUrl,
	resultSize,
	onGenerate,
	onDownload,
}: GifExportPanelProps) {
	const {
		speed,
		reverse,
		colorReduction,
		loopCount,
		rotation,
		flipH,
		flipV,
		crop,
		filters,
		frameSkip,
		compressionSpeed,
	} = useGifEditorStore(
		useShallow((s) => ({
			speed: s.speed,
			reverse: s.reverse,
			colorReduction: s.colorReduction,
			loopCount: s.loopCount,
			rotation: s.rotation,
			flipH: s.flipH,
			flipV: s.flipV,
			crop: s.crop,
			filters: s.filters,
			frameSkip: s.frameSkip,
			compressionSpeed: s.compressionSpeed,
		})),
	);

	const hasFilters =
		filters.exposure !== 1 ||
		filters.brightness !== 0 ||
		filters.contrast !== 1 ||
		filters.saturation !== 1 ||
		filters.temperature !== 0 ||
		filters.tint !== 0 ||
		filters.hue !== 0 ||
		filters.blur !== 0 ||
		filters.sepia !== 0 ||
		filters.vignette !== 0 ||
		filters.grain !== 0;

	const transforms: string[] = [];
	if (rotation !== 0) transforms.push(`Rotate ${rotation}°`);
	if (flipH) transforms.push('Flip H');
	if (flipV) transforms.push('Flip V');
	if (crop) transforms.push('Cropped');
	if (hasFilters) transforms.push('Filtered');
	if (frameSkip !== 'none') transforms.push(`Skip ${frameSkip}`);

	return (
		<>
			{/* Summary */}
			<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5">
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-1">Summary</h3>
				<div className="flex justify-between text-[14px]">
					<span className="text-text-tertiary">Frames</span>
					<span className="font-mono text-text-secondary">{formatNumber(estimatedFrames)}</span>
				</div>
				<div className="flex justify-between text-[14px]">
					<span className="text-text-tertiary">Duration</span>
					<span className="font-mono text-text-secondary">{formatNumber(clipDuration, 1)}s</span>
				</div>
				<div className="flex justify-between text-[14px]">
					<span className="text-text-tertiary">Resolution</span>
					<span className="font-mono text-text-secondary">
						{width} × {outputHeight}
					</span>
				</div>
				<div className="flex justify-between text-[14px]">
					<span className="text-text-tertiary">Speed</span>
					<span className="font-mono text-text-secondary">
						{speed}x{reverse ? ' (reversed)' : ''}
					</span>
				</div>
				<div className="flex justify-between text-[14px]">
					<span className="text-text-tertiary">Colors</span>
					<span className="font-mono text-text-secondary">{colorReduction}</span>
				</div>
				<div className="flex justify-between text-[14px]">
					<span className="text-text-tertiary">Loop</span>
					<span className="font-mono text-text-secondary">
						{loopCount === 0 ? 'Infinite' : `${loopCount}×`}
					</span>
				</div>
				<div className="flex justify-between text-[14px]">
					<span className="text-text-tertiary">Quality</span>
					<span className="font-mono text-text-secondary">
						{compressionSpeed <= 5 ? 'High' : compressionSpeed <= 15 ? 'Medium' : 'Fast'}
					</span>
				</div>
				{transforms.length > 0 && (
					<div className="flex justify-between text-[14px]">
						<span className="text-text-tertiary">Transforms</span>
						<span className="font-mono text-text-secondary text-right">{transforms.join(', ')}</span>
					</div>
				)}
			</div>

			{/* Result info */}
			{resultUrl && (
				<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
					<p className="text-[14px] text-success font-medium">GIF ready</p>
					<p className="text-[14px] text-text-tertiary mt-0.5">{formatFileSize(resultSize)}</p>
				</div>
			)}

			{/* Actions */}
			<div className="flex flex-col gap-2 mt-auto">
				<Button
					className="w-full"
					disabled={!file || !ready || processing}
					onClick={() => {
						onGenerate();
					}}
				>
					{processing ? `Generating ${Math.round(progress * 100)}%` : 'Generate GIF'}
				</Button>

				{resultUrl && (
					<Button
						variant="secondary"
						className="w-full"
						onClick={() => {
							onDownload();
						}}
					>
						Download ({formatFileSize(resultSize)})
					</Button>
				)}

				{error && <p className="text-[14px] text-danger bg-danger/10 rounded-md px-2.5 py-1.5">{error}</p>}
			</div>
		</>
	);
}
