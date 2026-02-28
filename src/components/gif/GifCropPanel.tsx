import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/index.ts';
import { useGifEditorStore, CROP_ASPECT_RATIOS, type CropRect, type CropAspectPreset } from '@/stores/gifEditor.ts';

const ASPECT_PRESETS: { label: string; value: CropAspectPreset }[] = [
	{ label: 'Free', value: 'free' },
	{ label: '1:1', value: '1:1' },
	{ label: '4:3', value: '4:3' },
	{ label: '16:9', value: '16:9' },
	{ label: '3:2', value: '3:2' },
	{ label: '2:1', value: '2:1' },
];

interface GifCropPanelProps {
	sourceWidth: number | null;
	sourceHeight: number | null;
}

export function GifCropPanel({ sourceWidth, sourceHeight }: GifCropPanelProps) {
	const { crop, cropAspect, setCrop, setCropAspect } = useGifEditorStore(
		useShallow((s) => ({
			crop: s.crop,
			cropAspect: s.cropAspect,
			setCrop: s.setCrop,
			setCropAspect: s.setCropAspect,
		})),
	);

	const xId = useId();
	const yId = useId();
	const wId = useId();
	const hId = useId();

	const handleAspectChange = (preset: CropAspectPreset) => {
		setCropAspect(preset);
		if (crop && sourceWidth && sourceHeight) {
			const ratio = CROP_ASPECT_RATIOS[preset];
			if (ratio) {
				const newW = Math.min(crop.width, sourceWidth);
				const newH = Math.round(newW / ratio);
				setCrop({ ...crop, width: newW, height: Math.min(newH, sourceHeight) });
			}
		}
	};

	const handleSelectAll = () => {
		if (!sourceWidth || !sourceHeight) return;
		const ratio = CROP_ASPECT_RATIOS[cropAspect];
		if (ratio) {
			const w = Math.min(sourceWidth, sourceHeight * ratio);
			const h = w / ratio;
			setCrop({ x: (sourceWidth - w) / 2, y: (sourceHeight - h) / 2, width: w, height: h });
		} else {
			setCrop({ x: 0, y: 0, width: sourceWidth, height: sourceHeight });
		}
	};

	const updateCropField = (field: keyof CropRect, value: number) => {
		if (!crop) return;
		const updated = { ...crop, [field]: Math.max(0, value) };
		setCrop(updated);
	};

	return (
		<>
			<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Aspect Ratio</h3>
			<div className="grid grid-cols-3 gap-1">
				{ASPECT_PRESETS.map((preset) => (
					<button
						key={preset.value}
						onClick={() => {
							handleAspectChange(preset.value);
						}}
						className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
							cropAspect === preset.value
								? 'bg-accent/15 text-accent border border-accent/30'
								: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
						}`}
					>
						{preset.label}
					</button>
				))}
			</div>

			{/* Manual crop dimensions */}
			{crop && (
				<div className="mt-3">
					<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
						Crop Area
					</h3>
					<div className="grid grid-cols-2 gap-2">
						<div>
							<label htmlFor={xId} className="text-[14px] text-text-tertiary mb-1 block">
								X
							</label>
							<input
								id={xId}
								type="number"
								min={0}
								value={Math.round(crop.x)}
								onChange={(e) => {
									updateCropField('x', Number(e.target.value));
								}}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>
						<div>
							<label htmlFor={yId} className="text-[14px] text-text-tertiary mb-1 block">
								Y
							</label>
							<input
								id={yId}
								type="number"
								min={0}
								value={Math.round(crop.y)}
								onChange={(e) => {
									updateCropField('y', Number(e.target.value));
								}}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>
						<div>
							<label htmlFor={wId} className="text-[14px] text-text-tertiary mb-1 block">
								Width
							</label>
							<input
								id={wId}
								type="number"
								min={1}
								value={Math.round(crop.width)}
								onChange={(e) => {
									updateCropField('width', Number(e.target.value));
								}}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>
						<div>
							<label htmlFor={hId} className="text-[14px] text-text-tertiary mb-1 block">
								Height
							</label>
							<input
								id={hId}
								type="number"
								min={1}
								value={Math.round(crop.height)}
								onChange={(e) => {
									updateCropField('height', Number(e.target.value));
								}}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
							/>
						</div>
					</div>
				</div>
			)}

			<div className="flex gap-2 mt-3">
				<Button
					variant="secondary"
					size="sm"
					className="flex-1"
					onClick={handleSelectAll}
					disabled={!sourceWidth || !sourceHeight}
				>
					Select All
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="flex-1"
					onClick={() => {
						setCrop(null);
					}}
					disabled={!crop}
				>
					Clear
				</Button>
			</div>

			{!crop && (
				<p className="text-[14px] text-text-tertiary mt-2">
					Click &ldquo;Select All&rdquo; or draw a crop area on the preview to begin.
				</p>
			)}
		</>
	);
}
