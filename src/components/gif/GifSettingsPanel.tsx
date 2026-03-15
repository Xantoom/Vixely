import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { GifPresetsPanel } from '@/components/gif/GifPresetsPanel.tsx';
import { Slider, Toggle } from '@/components/ui/index.ts';
import { gifPresetEntries } from '@/config/presets.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';

const GIF_PRESETS = gifPresetEntries();

interface GifSettingsPanelProps {
	fps: number;
	onFpsChange: (fps: number) => void;
	loop: boolean;
	onLoopChange: (loop: boolean) => void;
	isGifSource: boolean;
	trimStart: number;
	trimEnd: number;
	onTrimStartChange: (v: number) => void;
	onTrimEndChange: (v: number) => void;
	duration: number;
	selectedPreset: string | null;
	onSelectPreset: (key: string | null) => void;
	onApplyPreset: (key: string) => void;
}

export function GifSettingsPanel({
	fps,
	onFpsChange,
	loop,
	onLoopChange,
	isGifSource,
	trimStart,
	trimEnd,
	onTrimStartChange,
	onTrimEndChange,
	selectedPreset,
	onSelectPreset,
	onApplyPreset,
}: GifSettingsPanelProps) {
	const { speed, reverse, loopCount, setSpeed, setReverse, setLoopCount } = useGifEditorStore(
		useShallow((s) => ({
			speed: s.speed,
			reverse: s.reverse,
			loopCount: s.loopCount,
			setSpeed: s.setSpeed,
			setReverse: s.setReverse,
			setLoopCount: s.setLoopCount,
		})),
	);

	const trimStartId = useId();
	const trimDurationId = useId();
	const loopCountId = useId();

	return (
		<>
			{/* Presets */}
			<GifPresetsPanel
				presets={GIF_PRESETS}
				selectedPreset={selectedPreset}
				onSelectPreset={(key) => {
					onSelectPreset(key);
					if (key) onApplyPreset(key);
				}}
			/>

			{/* FPS */}
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

			{/* Loop */}
			<div className="flex items-center justify-between">
				<span className="text-[14px] font-medium text-text-secondary">Loop</span>
				<Toggle
					enabled={loop}
					onToggle={() => {
						onLoopChange(!loop);
					}}
					label="Toggle loop"
				/>
			</div>

			{/* Loop Count */}
			{loop && (
				<div>
					<label htmlFor={loopCountId} className="text-[14px] font-medium text-text-secondary mb-1.5 block">
						Loop Count
					</label>
					<div className="grid grid-cols-4 gap-1">
						{[
							{ label: '∞', value: 0 },
							{ label: '1×', value: 1 },
							{ label: '3×', value: 3 },
							{ label: '5×', value: 5 },
						].map((opt) => (
							<button
								key={opt.value}
								onClick={() => {
									setLoopCount(opt.value);
								}}
								className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
									loopCount === opt.value
										? 'bg-accent/15 text-accent border border-accent/30'
										: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
								}`}
							>
								{opt.label}
							</button>
						))}
					</div>
					<input
						id={loopCountId}
						type="number"
						min={0}
						max={65535}
						value={loopCount}
						onChange={(e) => {
							setLoopCount(Math.max(0, Math.min(65535, Number(e.target.value))));
						}}
						className="mt-1.5 w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
					/>
					<p className="text-[12px] text-text-tertiary mt-1">0 = infinite loop</p>
				</div>
			)}

			{/* Speed */}
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

			{/* Reverse */}
			<div className="flex items-center justify-between">
				<span className="text-[14px] font-medium text-text-secondary">Reverse</span>
				<Toggle
					enabled={reverse}
					onToggle={() => {
						setReverse(!reverse);
					}}
					label="Toggle reverse"
				/>
			</div>

			{/* GIF source trim inputs */}
			{isGifSource && (
				<div>
					<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Trim</h3>
					<div className="flex items-center gap-2">
						<div className="flex-1">
							<label htmlFor={trimStartId} className="text-[14px] text-text-tertiary mb-1 block">
								Start (s)
							</label>
							<input
								id={trimStartId}
								type="number"
								min={0}
								step={0.1}
								value={trimStart}
								onChange={(e) => {
									onTrimStartChange(Math.max(0, Number(e.target.value)));
								}}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>
						<div className="flex-1">
							<label htmlFor={trimDurationId} className="text-[14px] text-text-tertiary mb-1 block">
								Duration (s)
							</label>
							<input
								id={trimDurationId}
								type="number"
								min={0.5}
								step={0.5}
								value={Number((trimEnd - trimStart).toFixed(1))}
								onChange={(e) => {
									onTrimEndChange(trimStart + Math.max(0.5, Number(e.target.value)));
								}}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
