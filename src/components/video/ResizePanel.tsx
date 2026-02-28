import { Link2, Link2Off, RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
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
	const hasCropOffset = (resize.cropOffsetX ?? 0) !== 0 || (resize.cropOffsetY ?? 0) !== 0;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-2">
				<h3 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Resize</h3>
				{(changed || hasCropOffset) && (
					<button
						type="button"
						onClick={() => {
							setResize({
								width: resize.originalWidth,
								height: resize.originalHeight,
								scalePercent: 100,
								cropOffsetX: 0,
								cropOffsetY: 0,
							});
						}}
						className="flex cursor-pointer items-center gap-1 text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
					>
						<RotateCcw size={11} />
						Reset
					</button>
				)}
			</div>

			{!hasOriginal ? (
				<p className="text-[13px] text-text-tertiary">Load a video to see resize options.</p>
			) : (
				<>
					{/* Info row */}
					<div className="rounded-lg border border-border/60 bg-bg/40">
						<div className="flex items-center justify-between px-3.5 py-2.5">
							<span className="text-[12px] text-text-tertiary">Source</span>
							<span className="font-mono text-[13px] text-text-secondary">
								{formatDimensions(resize.originalWidth, resize.originalHeight)}
							</span>
						</div>
						<div className="h-px bg-border/40" />
						<div className="flex items-center justify-between px-3.5 py-2.5">
							<span className="text-[12px] text-text-tertiary">Output</span>
							<span
								className={`font-mono text-[13px] ${changed ? 'font-semibold text-accent' : 'text-text-secondary'}`}
							>
								{formatDimensions(resize.width, resize.height)}
							</span>
						</div>
						<div className="h-px bg-border/40" />
						<div className="flex items-center justify-between px-3.5 py-2.5">
							<span className="text-[12px] text-text-tertiary">Scale</span>
							<span
								className={`font-mono text-[13px] ${changed ? 'text-accent' : 'text-text-secondary'}`}
							>
								{resize.scalePercent}%
							</span>
						</div>
						{hasCropOffset && (
							<>
								<div className="h-px bg-border/40" />
								<div className="flex items-center justify-between px-3.5 py-2.5">
									<span className="text-[12px] text-text-tertiary">Offset</span>
									<span className="font-mono text-[13px] text-accent">
										{(resize.cropOffsetX ?? 0) > 0 ? '+' : ''}
										{Math.round(resize.cropOffsetX ?? 0)}, 
										{(resize.cropOffsetY ?? 0) > 0 ? '+' : ''}
										{Math.round(resize.cropOffsetY ?? 0)}
									</span>
								</div>
							</>
						)}
					</div>

					{/* Drag hint */}
					<p className="text-[12px] text-text-tertiary">
						Drag handles to resize. Drag inside the selection to reposition the crop area. Double-click to
						center.
					</p>

					{/* Output size controls */}
					<div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-bg/40 px-3.5 py-3">
						<div className="flex items-center justify-between">
							<p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
								Output Size
							</p>
							<button
								type="button"
								onClick={() => {
									setResize({ lockAspect: !resize.lockAspect });
								}}
								className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-all ${
									resize.lockAspect
										? 'border-accent/30 bg-accent/10 text-accent'
										: 'border-border bg-surface-raised/60 text-text-tertiary hover:text-text-secondary'
								}`}
								title={resize.lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
								aria-pressed={resize.lockAspect}
								aria-label="Toggle aspect ratio lock"
							>
								{resize.lockAspect ? <Link2 size={12} /> : <Link2Off size={12} />}
								{resize.lockAspect ? 'Locked' : 'Unlock'}
							</button>
						</div>

						<div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
							<div>
								<label className="mb-1 block text-[12px] text-text-tertiary">Width</label>
								<input
									type="number"
									min={1}
									max={7680}
									value={resize.width}
									onChange={(e) => {
										setResize({ width: Math.max(1, Number(e.target.value)) });
									}}
									className="h-9 w-full rounded-md border border-border bg-surface-raised/60 px-2 font-mono text-[13px] tabular-nums text-text focus:border-accent/50 focus:outline-none"
								/>
							</div>
							<div className="pb-2 text-sm text-text-tertiary/50">×</div>
							<div>
								<label className="mb-1 block text-[12px] text-text-tertiary">Height</label>
								<input
									type="number"
									min={1}
									max={7680}
									value={resize.height}
									onChange={(e) => {
										setResize({ height: Math.max(1, Number(e.target.value)) });
									}}
									className="h-9 w-full rounded-md border border-border bg-surface-raised/60 px-2 font-mono text-[13px] tabular-nums text-text focus:border-accent/50 focus:outline-none"
								/>
							</div>
						</div>

						{/* Scale slider */}
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between">
								<label className="text-sm font-medium text-text-secondary">Scale</label>
								<span className="font-mono text-sm tabular-nums text-text-tertiary">
									{resize.scalePercent}%
								</span>
							</div>
							<input
								type="range"
								min={10}
								max={400}
								step={1}
								value={resize.scalePercent}
								onChange={(e) => {
									setResize({ scalePercent: Number(e.target.value) });
								}}
								className="w-full"
								aria-label="Scale"
							/>
						</div>
					</div>

					{/* Size presets */}
					<div className="flex flex-col gap-2">
						<p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
							Size Presets
						</p>
						<div className="grid grid-cols-4 gap-1">
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
												lockAspect:
													Math.abs(
														preset.w / preset.h -
															resize.originalWidth / resize.originalHeight,
													) <= 0.01,
											});
										}}
										className={`rounded-md py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
											active
												? 'border border-accent/30 bg-accent/12 text-accent'
												: 'border border-transparent bg-surface-raised/60 text-text-tertiary hover:bg-surface-raised hover:text-text-secondary'
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
										cropOffsetX: 0,
										cropOffsetY: 0,
									});
								}}
								className={`rounded-md py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
									!changed && !hasCropOffset
										? 'border border-accent/30 bg-accent/12 text-accent'
										: 'border border-transparent bg-surface-raised/60 text-text-tertiary hover:bg-surface-raised hover:text-text-secondary'
								}`}
							>
								Original
							</button>
						</div>
					</div>

					{/* Aspect ratio presets */}
					<div className="flex flex-col gap-2">
						<p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
							Aspect Ratio
						</p>
						<div className="grid grid-cols-5 gap-1">
							{ASPECT_PRESETS.map((aspect) => {
								const ratio = aspect.w / aspect.h;
								const active = Math.abs(resize.width / resize.height - ratio) < 0.01;
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
												? 'border border-accent/30 bg-accent/12 text-accent'
												: 'border border-transparent bg-surface-raised/60 text-text-tertiary hover:bg-surface-raised hover:text-text-secondary'
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
