import { useShallow } from 'zustand/react/shallow';
import { Button, Slider } from '@/components/ui/index.ts';
import { gifPresetEntries } from '@/config/presets.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { formatFileSize, formatNumber } from '@/utils/format.ts';

const GIF_PRESETS = gifPresetEntries();

interface GifSidebarProps {
	fps: number;
	width: number;
	loop: boolean;
	trimStart: number;
	trimEnd: number;
	duration: number;
	file: File | null;
	ready: boolean;
	processing: boolean;
	progress: number;
	resultUrl: string | null;
	resultSize: number;
	error: string | null;
	onFpsChange: (v: number) => void;
	onWidthChange: (v: number) => void;
	onLoopChange: (v: boolean) => void;
	onTrimEndChange: (v: number) => void;
	onApplyPreset: (key: string) => void;
	onGenerate: () => void;
	onDownload: () => void;
}

export function GifSidebar({
	fps,
	width,
	loop,
	trimStart,
	trimEnd,
	file,
	ready,
	processing,
	progress,
	resultUrl,
	resultSize,
	error,
	onFpsChange,
	onWidthChange,
	onLoopChange,
	onApplyPreset,
	onGenerate,
	onDownload,
}: GifSidebarProps) {
	const { speed, reverse, setSpeed, setReverse, colorReduction, setColorReduction } = useGifEditorStore(
		useShallow((s) => ({
			speed: s.speed,
			reverse: s.reverse,
			setSpeed: s.setSpeed,
			setReverse: s.setReverse,
			colorReduction: s.colorReduction,
			setColorReduction: s.setColorReduction,
		})),
	);
	const clipDuration = Math.max(trimEnd - trimStart, 0);
	const estimatedFrames = Math.ceil(clipDuration * fps);

	return (
		<div className="flex flex-col h-full">
			{/* Presets */}
			<div className="p-4 border-b border-border">
				<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					Quick Presets
				</h3>
				<div className="grid grid-cols-2 gap-1.5">
					{GIF_PRESETS.map(([key, preset]) => (
						<button
							key={key}
							onClick={() => {
								onApplyPreset(key);
							}}
							className="rounded-lg px-2.5 py-2 text-left cursor-pointer bg-surface-raised/50 border border-transparent text-text-secondary hover:bg-surface-raised hover:text-text transition-all"
						>
							<p className="text-[13px] font-medium truncate">{preset.name}</p>
							<p className="text-[13px] text-text-tertiary truncate">{preset.description}</p>
						</button>
					))}
				</div>
			</div>

			{/* Controls */}
			<div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
				<Slider
					label="Smoothness"
					displayValue={`${fps} fps`}
					min={5}
					max={30}
					step={1}
					value={fps}
					onChange={(e) => {
						onFpsChange(Number(e.target.value));
					}}
				/>

				<Slider
					label="Size"
					displayValue={`${formatNumber(width)}px`}
					min={128}
					max={1280}
					step={16}
					value={width}
					onChange={(e) => {
						onWidthChange(Number(e.target.value));
					}}
				/>

				<Slider
					label="Speed"
					displayValue={`${speed}x`}
					min={0.25}
					max={4}
					step={0.25}
					value={speed}
					onChange={(e) => {
						setSpeed(Number(e.target.value));
					}}
				/>

				<Slider
					label="Colors"
					displayValue={`${colorReduction}`}
					min={16}
					max={256}
					step={16}
					value={colorReduction}
					onChange={(e) => {
						setColorReduction(Number(e.target.value));
					}}
				/>

				{/* Toggles */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<label className="text-[13px] font-medium text-text-secondary">Loop</label>
						<button
							onClick={() => {
								onLoopChange(!loop);
							}}
							className={`h-6 w-10 rounded-full transition-colors cursor-pointer ${
								loop ? 'bg-accent' : 'bg-surface-raised'
							}`}
						>
							<div
								className={`h-4 w-4 rounded-full bg-white transition-transform mx-1 ${
									loop ? 'translate-x-4' : 'translate-x-0'
								}`}
							/>
						</button>
					</div>
					<div className="flex items-center justify-between">
						<label className="text-[13px] font-medium text-text-secondary">Reverse</label>
						<button
							onClick={() => {
								setReverse(!reverse);
							}}
							className={`h-6 w-10 rounded-full transition-colors cursor-pointer ${
								reverse ? 'bg-accent' : 'bg-surface-raised'
							}`}
						>
							<div
								className={`h-4 w-4 rounded-full bg-white transition-transform mx-1 ${
									reverse ? 'translate-x-4' : 'translate-x-0'
								}`}
							/>
						</button>
					</div>
				</div>

				{/* Estimate */}
				<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1">
					<div className="flex justify-between text-[13px]">
						<span className="text-text-tertiary">Frames</span>
						<span className="font-mono text-text-secondary">{formatNumber(estimatedFrames)}</span>
					</div>
					<div className="flex justify-between text-[13px]">
						<span className="text-text-tertiary">Duration</span>
						<span className="font-mono text-text-secondary">{formatNumber(clipDuration, 1)}s</span>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className="p-4 border-t border-border flex flex-col gap-2">
				<Button className="w-full" disabled={!file || !ready || processing} onClick={onGenerate}>
					{processing ? `Generating ${Math.round(progress * 100)}%` : 'Generate GIF'}
				</Button>

				{resultUrl && (
					<Button variant="secondary" className="w-full" onClick={onDownload}>
						Download ({formatFileSize(resultSize)})
					</Button>
				)}

				{error && <p className="text-[13px] text-danger bg-danger/10 rounded-md px-2.5 py-1.5">{error}</p>}
			</div>
		</div>
	);
}
