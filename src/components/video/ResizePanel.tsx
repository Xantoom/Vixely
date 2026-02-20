import { Link2, Link2Off } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/index.ts';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';
import { formatDimensions } from '@/utils/format.ts';

const SIZE_PRESETS = [
	{ label: '360p', w: 640, h: 360 },
	{ label: '480p', w: 854, h: 480 },
	{ label: '720p', w: 1280, h: 720 },
	{ label: '1080p', w: 1920, h: 1080 },
	{ label: '9:16 HD', w: 1080, h: 1920 },
	{ label: '1440p', w: 2560, h: 1440 },
	{ label: '4K', w: 3840, h: 2160 },
];

const ASPECT_PRESETS = [
	{ label: '1:1', w: 1, h: 1 },
	{ label: '4:5', w: 4, h: 5 },
	{ label: '16:9', w: 16, h: 9 },
	{ label: '9:16', w: 9, h: 16 },
	{ label: '21:9', w: 21, h: 9 },
];

export function ResizePanel() {
	const { resize, setResize } = useVideoEditorStore(
		useShallow((s) => ({ resize: s.resize, setResize: s.setResize })),
	);

	const hasOriginal = resize.originalWidth > 0 && resize.originalHeight > 0;
	const changed = resize.width !== resize.originalWidth || resize.height !== resize.originalHeight;
	const currentAspect = resize.height > 0 ? resize.width / resize.height : 0;
	const sourceAspect = hasOriginal ? resize.originalWidth / resize.originalHeight : 0;
	const aspectChanged = hasOriginal && Math.abs(currentAspect - sourceAspect) > 0.01;

	return (
		<div className="flex flex-col gap-4">
			<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider">Resize</h3>
			<p className="text-[13px] text-text-tertiary">
				Drag the selection zone directly on the preview to adjust output size visually.
			</p>

			{!hasOriginal && <p className="text-[14px] text-text-tertiary">Load a video to see resize options.</p>}

			{hasOriginal && (
				<>
					<div className="rounded-xl border border-border/60 bg-bg/30 px-3.5 py-3">
						<div className="flex items-center justify-between text-[13px]">
							<span className="text-text-tertiary">Source</span>
							<span className="font-mono text-text-secondary">
								{formatDimensions(resize.originalWidth, resize.originalHeight)}
							</span>
						</div>
						<div className="mt-1.5 flex items-center justify-between text-[13px]">
							<span className="text-text-tertiary">Output</span>
							<span className={`font-mono ${changed ? 'text-accent' : 'text-text-secondary'}`}>
								{formatDimensions(resize.width, resize.height)}
							</span>
						</div>
						<div className="mt-1.5 flex items-center justify-between text-[13px]">
							<span className="text-text-tertiary">Scale</span>
							<span className="font-mono text-text-secondary">{resize.scalePercent}%</span>
						</div>
						{aspectChanged && (
							<p className="mt-2 rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-[12px] text-accent">
								Aspect ratio changed. Output will be stretched.
							</p>
						)}
					</div>

					<div className="rounded-xl border border-border/60 bg-bg/30 px-3.5 py-3">
						<div className="mb-2 flex items-center justify-between">
							<p className="text-[13px] font-semibold uppercase tracking-wide text-text-tertiary">
								Output Size
							</p>
							<button
								type="button"
								onClick={() => {
									setResize({ lockAspect: !resize.lockAspect });
								}}
								className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-all cursor-pointer ${
									resize.lockAspect
										? 'border-accent/30 bg-accent/10 text-accent'
										: 'border-border bg-surface-raised/60 text-text-tertiary'
								}`}
								title={resize.lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
								aria-pressed={resize.lockAspect}
								aria-label="Toggle aspect ratio lock"
							>
								{resize.lockAspect ? <Link2 size={13} /> : <Link2Off size={13} />}
							</button>
						</div>
						<div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
							<div>
								<label className="text-[13px] text-text-tertiary mb-1 block">Width</label>
								<input
									type="number"
									min={1}
									max={7680}
									value={resize.width}
									onChange={(e) => {
										setResize({ width: Math.max(1, Number(e.target.value)) });
									}}
									className="w-full h-9 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
							<div className="pb-2 text-text-tertiary/70 text-sm">×</div>
							<div>
								<label className="text-[13px] text-text-tertiary mb-1 block">Height</label>
								<input
									type="number"
									min={1}
									max={7680}
									value={resize.height}
									onChange={(e) => {
										setResize({ height: Math.max(1, Number(e.target.value)) });
									}}
									className="w-full h-9 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
						</div>
						<div className="mt-3">
							<Slider
								label="Scale"
								displayValue={`${resize.scalePercent}%`}
								min={10}
								max={400}
								step={1}
								value={resize.scalePercent}
								onChange={(e) => {
									setResize({ scalePercent: Number(e.target.value) });
								}}
							/>
						</div>
					</div>

					<div className="rounded-xl border border-border/60 bg-bg/30 px-3.5 py-3">
						<p className="text-[13px] text-text-tertiary mb-2 uppercase tracking-wide">Size Presets</p>
						<div className="grid grid-cols-3 gap-1">
							{SIZE_PRESETS.map((preset) => {
								const active = resize.width === preset.w && resize.height === preset.h;
								return (
									<button
										type="button"
										key={preset.label}
										onClick={() => {
											setResize({
												width: preset.w,
												height: preset.h,
												lockAspect: Math.abs(preset.w / preset.h - sourceAspect) <= 0.01,
											});
										}}
										className={`rounded-md py-1.5 text-[13px] font-medium transition-all cursor-pointer ${
											active
												? 'bg-accent/15 text-accent border border-accent/30'
												: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
										}`}
									>
										{preset.label}
									</button>
								);
							})}
							<button
								type="button"
								onClick={() => {
									setResize({
										width: resize.originalWidth,
										height: resize.originalHeight,
										scalePercent: 100,
									});
								}}
								className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
									!changed
										? 'bg-accent/15 text-accent border border-accent/30'
										: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
								}`}
							>
								Original
							</button>
						</div>
					</div>

					<div className="rounded-xl border border-border/60 bg-bg/30 px-3.5 py-3">
						<p className="text-[13px] text-text-tertiary mb-2 uppercase tracking-wide">Aspect Ratio</p>
						<div className="grid grid-cols-5 gap-1">
							{ASPECT_PRESETS.map((aspect) => {
								const ratio = aspect.w / aspect.h;
								const active = Math.abs(currentAspect - ratio) < 0.01;
								return (
									<button
										type="button"
										key={aspect.label}
										onClick={() => {
											const nextWidth = Math.max(1, resize.width);
											const nextHeight = Math.max(1, Math.round(nextWidth / ratio));
											setResize({ lockAspect: false, width: nextWidth, height: nextHeight });
										}}
										className={`rounded-md py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
											active
												? 'bg-accent/15 text-accent border border-accent/30'
												: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
										}`}
									>
										{aspect.label}
									</button>
								);
							})}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
