import { Download, Trash2, CheckSquare, Square, Clock } from 'lucide-react';
import { useCallback, useId } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/index.ts';
import { useGifEditorStore, type ExtractedFrame } from '@/stores/gifEditor.ts';

interface GifFramesPanelProps {
	file: File | null;
	processing: boolean;
	progress: number;
	onExtractFrames: () => void;
}

export function GifFramesPanel({ file, processing, progress, onExtractFrames }: GifFramesPanelProps) {
	const {
		extractedFrames,
		selectedFrameIndex,
		setSelectedFrameIndex,
		toggleFrameSelected,
		selectAllFrames,
		deselectAllFrames,
		deleteSelectedFrames,
		setFrameDelay,
	} = useGifEditorStore(
		useShallow((s) => ({
			extractedFrames: s.extractedFrames,
			selectedFrameIndex: s.selectedFrameIndex,
			setSelectedFrameIndex: s.setSelectedFrameIndex,
			toggleFrameSelected: s.toggleFrameSelected,
			selectAllFrames: s.selectAllFrames,
			deselectAllFrames: s.deselectAllFrames,
			deleteSelectedFrames: s.deleteSelectedFrames,
			setFrameDelay: s.setFrameDelay,
		})),
	);

	const selectedCount = extractedFrames.filter((f) => f.selected).length;
	const hasFrames = extractedFrames.length > 0;

	const handleDownloadFrame = useCallback((frame: ExtractedFrame) => {
		const a = document.createElement('a');
		a.href = frame.url;
		a.download = `frame-${String(frame.index + 1).padStart(3, '0')}.png`;
		a.click();
	}, []);

	const handleDownloadSelected = useCallback(() => {
		const selected = extractedFrames.filter((f) => f.selected);
		if (selected.length === 0) {
			toast.error('No frames selected');
			return;
		}
		for (const frame of selected) {
			const a = document.createElement('a');
			a.href = frame.url;
			a.download = `frame-${String(frame.index + 1).padStart(3, '0')}.png`;
			a.click();
		}
		toast.success(`Downloaded ${selected.length} frames`);
	}, [extractedFrames]);

	const handleDeleteSelected = useCallback(() => {
		if (selectedCount === 0) return;
		deleteSelectedFrames();
		toast.success(`Deleted ${selectedCount} frames`);
	}, [selectedCount, deleteSelectedFrames]);

	return (
		<>
			{/* Extract button */}
			{!hasFrames && (
				<div className="flex flex-col gap-3">
					<Button className="w-full" disabled={!file || processing} onClick={onExtractFrames}>
						{processing ? `Extracting ${Math.round(progress * 100)}%` : 'Extract Frames'}
					</Button>
					<p className="text-[14px] text-text-tertiary">
						Extract individual frames from your video or GIF. You can then view, reorder, delete, or
						download them.
					</p>
				</div>
			)}

			{/* Frame controls */}
			{hasFrames && (
				<>
					<div className="flex items-center justify-between">
						<p className="text-[14px] font-medium text-text-secondary">{extractedFrames.length} frames</p>
						<div className="flex gap-1">
							<Button
								variant="ghost"
								size="icon"
								title={selectedCount === extractedFrames.length ? 'Deselect all' : 'Select all'}
								onClick={() => {
									if (selectedCount === extractedFrames.length) deselectAllFrames();
									else selectAllFrames();
								}}
							>
								{selectedCount === extractedFrames.length ? (
									<CheckSquare size={14} />
								) : (
									<Square size={14} />
								)}
							</Button>
						</div>
					</div>

					{/* Selection actions */}
					{selectedCount > 0 && (
						<div className="flex gap-2">
							<Button variant="secondary" size="sm" className="flex-1" onClick={handleDownloadSelected}>
								<Download size={12} />
								Download ({selectedCount})
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="text-danger hover:text-danger"
								onClick={handleDeleteSelected}
							>
								<Trash2 size={12} />
								Delete
							</Button>
						</div>
					)}

					{/* Filmstrip */}
					<div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
						{extractedFrames.map((frame) => (
							<FrameRow
								key={frame.index}
								frame={frame}
								isSelected={selectedFrameIndex === frame.index}
								onSelect={() => {
									setSelectedFrameIndex(frame.index);
								}}
								onToggleCheck={() => {
									toggleFrameSelected(frame.index);
								}}
								onDownload={() => {
									handleDownloadFrame(frame);
								}}
								onDelayChange={(delay) => {
									setFrameDelay(frame.index, delay);
								}}
							/>
						))}
					</div>

					{/* Re-extract */}
					<Button variant="ghost" size="sm" disabled={processing} onClick={onExtractFrames}>
						Re-extract Frames
					</Button>
				</>
			)}
		</>
	);
}

function FrameRow({
	frame,
	isSelected,
	onSelect,
	onToggleCheck,
	onDownload,
	onDelayChange,
}: {
	frame: ExtractedFrame;
	isSelected: boolean;
	onSelect: () => void;
	onToggleCheck: () => void;
	onDownload: () => void;
	onDelayChange: (delay: number) => void;
}) {
	const delayId = useId();

	return (
		<div
			className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all cursor-pointer ${
				isSelected
					? 'bg-accent/10 border border-accent/30'
					: 'bg-surface-raised/30 border border-transparent hover:bg-surface-raised/60'
			}`}
			onClick={onSelect}
		>
			{/* Checkbox */}
			<button
				className="shrink-0 cursor-pointer"
				onClick={(e) => {
					e.stopPropagation();
					onToggleCheck();
				}}
			>
				{frame.selected ? (
					<CheckSquare size={14} className="text-accent" />
				) : (
					<Square size={14} className="text-text-tertiary" />
				)}
			</button>

			{/* Thumbnail */}
			<img
				src={frame.url}
				alt={`Frame ${frame.index + 1}`}
				width={48}
				height={Math.round(48 * (frame.height / frame.width))}
				className="shrink-0 rounded bg-black object-contain"
			/>

			{/* Info */}
			<div className="flex-1 min-w-0">
				<p className="text-[12px] font-medium text-text-secondary">#{frame.index + 1}</p>
				<p className="text-[11px] text-text-tertiary">{(frame.timeMs / 1000).toFixed(2)}s</p>
			</div>

			{/* Delay */}
			<div className="flex items-center gap-1 shrink-0">
				<Clock size={10} className="text-text-tertiary" />
				<input
					id={delayId}
					type="number"
					min={1}
					max={6000}
					value={frame.delayCentiseconds}
					onChange={(e) => {
						e.stopPropagation();
						onDelayChange(Math.max(1, Math.min(6000, Number(e.target.value))));
					}}
					onClick={(e) => {
						e.stopPropagation();
					}}
					className="w-12 h-6 px-1 text-[11px] font-mono text-text tabular-nums bg-surface-raised/60 border border-border rounded text-center focus:outline-none focus:border-accent/50"
					title="Frame delay (centiseconds)"
				/>
			</div>

			{/* Download */}
			<button
				className="shrink-0 text-text-tertiary hover:text-text cursor-pointer"
				onClick={(e) => {
					e.stopPropagation();
					onDownload();
				}}
				title="Download frame"
			>
				<Download size={12} />
			</button>
		</div>
	);
}
