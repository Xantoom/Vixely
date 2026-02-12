import { Link2, Link2Off } from 'lucide-react';
import { Slider } from '@/components/ui/index.ts';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';
import { formatDimensions } from '@/utils/format.ts';

const QUICK_PRESETS = [
	{ label: '480p', w: 854, h: 480 },
	{ label: '720p', w: 1280, h: 720 },
	{ label: '1080p', w: 1920, h: 1080 },
	{ label: '1440p', w: 2560, h: 1440 },
	{ label: '4K', w: 3840, h: 2160 },
];

export function ResizePanel() {
	const resize = useVideoEditorStore((s) => s.resize);
	const setResize = useVideoEditorStore((s) => s.setResize);

	const hasOriginal = resize.originalWidth > 0 && resize.originalHeight > 0;
	const changed = resize.width !== resize.originalWidth || resize.height !== resize.originalHeight;

	return (
		<div className="flex flex-col gap-4">
			<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">Resize</h3>

			{!hasOriginal && <p className="text-[13px] text-text-tertiary">Load a video to see resize options.</p>}

			{hasOriginal && (
				<>
					{/* Original dimensions */}
					<div className="rounded-lg bg-bg/50 px-3 py-2">
						<div className="flex justify-between text-[13px]">
							<span className="text-text-tertiary">Original</span>
							<span className="font-mono text-text-secondary">
								{formatDimensions(resize.originalWidth, resize.originalHeight)}
							</span>
						</div>
						{changed && (
							<div className="flex justify-between text-[13px] mt-1">
								<span className="text-text-tertiary">Current</span>
								<span className="font-mono text-accent">
									{formatDimensions(resize.width, resize.height)}
								</span>
							</div>
						)}
					</div>

					{/* Width / Height inputs */}
					<div className="flex items-end gap-2">
						<div className="flex-1">
							<label className="text-[12px] text-text-tertiary mb-1 block">Width</label>
							<input
								type="number"
								min={1}
								max={7680}
								value={resize.width}
								onChange={(e) => setResize({ width: Math.max(1, Number(e.target.value)) })}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>

						<button
							onClick={() => setResize({ lockAspect: !resize.lockAspect })}
							className={`h-8 w-8 flex items-center justify-center rounded-md border transition-all cursor-pointer mb-px ${
								resize.lockAspect
									? 'border-accent/30 bg-accent/10 text-accent'
									: 'border-border bg-surface-raised/60 text-text-tertiary'
							}`}
							title={resize.lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
						>
							{resize.lockAspect ? <Link2 size={13} /> : <Link2Off size={13} />}
						</button>

						<div className="flex-1">
							<label className="text-[12px] text-text-tertiary mb-1 block">Height</label>
							<input
								type="number"
								min={1}
								max={7680}
								value={resize.height}
								onChange={(e) => setResize({ height: Math.max(1, Number(e.target.value)) })}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>
					</div>

					{/* Scale slider */}
					<Slider
						label="Scale"
						displayValue={`${resize.scalePercent}%`}
						min={10}
						max={400}
						step={1}
						value={resize.scalePercent}
						onChange={(e) => setResize({ scalePercent: Number(e.target.value) })}
					/>

					{/* Quick presets */}
					<div>
						<label className="text-[12px] text-text-tertiary mb-1.5 block">Quick Presets</label>
						<div className="grid grid-cols-3 gap-1">
							{QUICK_PRESETS.map((p) => {
								const active = resize.width === p.w && resize.height === p.h;
								return (
									<button
										key={p.label}
										onClick={() =>
											setResize({
												width: p.w,
												height: p.h,
												scalePercent: Math.round((p.w / resize.originalWidth) * 100),
											})
										}
										className={`rounded-md py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
											active
												? 'bg-accent/15 text-accent border border-accent/30'
												: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
										}`}
									>
										{p.label}
									</button>
								);
							})}
							<button
								onClick={() =>
									setResize({
										width: resize.originalWidth,
										height: resize.originalHeight,
										scalePercent: 100,
									})
								}
								className={`rounded-md py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
									!changed
										? 'bg-accent/15 text-accent border border-accent/30'
										: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
								}`}
							>
								Original
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
