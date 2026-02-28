import { useShallow } from 'zustand/react/shallow';
import { Slider, Toggle } from '@/components/ui/index.ts';
import { useGifEditorStore, type FrameSkipMode } from '@/stores/gifEditor.ts';

const FRAME_SKIP_OPTIONS: { label: string; value: FrameSkipMode }[] = [
	{ label: 'None', value: 'none' },
	{ label: 'Every 2nd', value: 'every2nd' },
	{ label: 'Every 3rd', value: 'every3rd' },
	{ label: 'Every 4th', value: 'every4th' },
];

export function GifOptimizePanel() {
	const {
		colorReduction,
		compressionSpeed,
		frameSkip,
		dithering,
		setColorReduction,
		setCompressionSpeed,
		setFrameSkip,
		setDithering,
	} = useGifEditorStore(
		useShallow((s) => ({
			colorReduction: s.colorReduction,
			compressionSpeed: s.compressionSpeed,
			frameSkip: s.frameSkip,
			dithering: s.dithering,
			setColorReduction: s.setColorReduction,
			setCompressionSpeed: s.setCompressionSpeed,
			setFrameSkip: s.setFrameSkip,
			setDithering: s.setDithering,
		})),
	);

	return (
		<>
			{/* Color Reduction */}
			<div>
				<Slider
					label="Max Colors"
					displayValue={`${colorReduction}`}
					min={2}
					max={256}
					step={2}
					value={colorReduction}
					onChange={(e) => {
						setColorReduction(Number(e.target.value));
					}}
				/>
				<div className="flex justify-between text-[12px] text-text-tertiary mt-1">
					<span>Smaller file</span>
					<span>Better quality</span>
				</div>
			</div>

			{/* Compression Speed / Quality */}
			<div>
				<Slider
					label="Quality"
					displayValue={compressionSpeed <= 5 ? 'High' : compressionSpeed <= 15 ? 'Medium' : 'Fast'}
					min={1}
					max={30}
					step={1}
					value={compressionSpeed}
					onChange={(e) => {
						setCompressionSpeed(Number(e.target.value));
					}}
				/>
				<div className="flex justify-between text-[12px] text-text-tertiary mt-1">
					<span>Best quality (slow)</span>
					<span>Fastest</span>
				</div>
			</div>

			{/* Frame Skip */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
					Frame Skip
				</h3>
				<div className="grid grid-cols-2 gap-1">
					{FRAME_SKIP_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							onClick={() => {
								setFrameSkip(opt.value);
							}}
							className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
								frameSkip === opt.value
									? 'bg-accent/15 text-accent border border-accent/30'
									: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
							}`}
						>
							{opt.label}
						</button>
					))}
				</div>
				<p className="text-[12px] text-text-tertiary mt-1.5">
					Drop frames to reduce file size. Animation may appear less smooth.
				</p>
			</div>

			{/* Dithering */}
			<div className="flex items-center justify-between">
				<div>
					<span className="text-[14px] font-medium text-text-secondary block">Dithering</span>
					<span className="text-[12px] text-text-tertiary">Smoother color gradients</span>
				</div>
				<Toggle
					enabled={dithering}
					onToggle={() => {
						setDithering(!dithering);
					}}
					label="Toggle dithering"
				/>
			</div>

			{/* Tips */}
			<div className="rounded-lg bg-bg/50 p-3">
				<h4 className="text-[14px] font-medium text-text-secondary mb-1">Optimization Tips</h4>
				<ul className="text-[12px] text-text-tertiary space-y-1 list-disc pl-4">
					<li>Reduce colors for the biggest file size reduction</li>
					<li>Skip frames for long animations with high FPS</li>
					<li>Lower quality setting speeds up encoding</li>
					<li>Crop or resize to smaller dimensions for smaller files</li>
				</ul>
			</div>
		</>
	);
}
