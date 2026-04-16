import { Lock, Unlock } from 'lucide-react';
import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button.tsx';
import { useGifEditorStore, CROP_ASPECT_RATIOS, type CropAspectPreset } from '@/stores/gifEditor.ts';

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
	const { crop, cropAspect, cropLockAspect, setCrop, setCropAspect, setCropLockAspect } = useGifEditorStore(
		useShallow((s) => ({
			crop: s.crop,
			cropAspect: s.cropAspect,
			cropLockAspect: s.cropLockAspect,
			setCrop: s.setCrop,
			setCropAspect: s.setCropAspect,
			setCropLockAspect: s.setCropLockAspect,
		})),
	);

	const wId = useId();
	const hId = useId();

	const handleAspectChange = (preset: CropAspectPreset) => {
		setCropAspect(preset);
		// Lock aspect when picking a ratio, unlock on 'free'
		setCropLockAspect(preset !== 'free');
		if (!sourceWidth || !sourceHeight) return;
		const ratio = CROP_ASPECT_RATIOS[preset];
		if (ratio) {
			const w = Math.min(sourceWidth, sourceHeight * ratio);
			const h = w / ratio;
			setCrop({ x: (sourceWidth - w) / 2, y: (sourceHeight - h) / 2, width: w, height: h });
		} else if (!crop) {
			setCrop({ x: 0, y: 0, width: sourceWidth, height: sourceHeight });
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

	const updateCropDimension = (field: 'width' | 'height', value: number) => {
		if (!crop || !sourceWidth || !sourceHeight) return;
		const updated = { ...crop };
		updated[field] = Math.max(1, value);

		if (cropLockAspect && crop.width > 0 && crop.height > 0) {
			const ratio = crop.width / crop.height;
			if (field === 'width') {
				updated.height = Math.round(updated.width / ratio);
			} else {
				updated.width = Math.round(updated.height * ratio);
			}
		}

		// Clamp to source bounds
		updated.width = Math.min(updated.width, sourceWidth);
		updated.height = Math.min(updated.height, sourceHeight);
		updated.x = Math.max(0, Math.min(updated.x, sourceWidth - updated.width));
		updated.y = Math.max(0, Math.min(updated.y, sourceHeight - updated.height));
		setCrop(updated);
	};

	const toggleLock = () => {
		setCropLockAspect(!cropLockAspect);
	};

	return (
		<>
			{/* Aspect ratio presets */}
			<div className="grid grid-cols-3 gap-1">
				{ASPECT_PRESETS.map((preset) => (
					<button
						key={preset.value}
						onClick={() => {
							handleAspectChange(preset.value);
						}}
						className={`rounded-md py-1.5 text-[13px] font-medium transition-all cursor-pointer ${
							cropAspect === preset.value
								? 'bg-accent/15 text-accent border border-accent/30'
								: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
						}`}
					>
						{preset.label}
					</button>
				))}
			</div>

			{/* Dimensions row with lock */}
			{crop && (
				<div className="flex items-center gap-2">
					<div className="flex-1">
						<label htmlFor={wId} className="text-[13px] text-text-tertiary mb-1 block">
							W
						</label>
						<input
							id={wId}
							type="number"
							min={1}
							max={sourceWidth ?? 9999}
							value={Math.round(crop.width)}
							onChange={(e) => {
								updateCropDimension('width', Number(e.target.value));
							}}
							className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
						/>
					</div>
					<button
						onClick={toggleLock}
						type="button"
						aria-label={cropLockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
						title={cropLockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
						className={`mt-5 h-8 w-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
							cropLockAspect ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text'
						}`}
					>
						{cropLockAspect ? <Lock size={12} /> : <Unlock size={12} />}
					</button>
					<div className="flex-1">
						<label htmlFor={hId} className="text-[13px] text-text-tertiary mb-1 block">
							H
						</label>
						<input
							id={hId}
							type="number"
							min={1}
							max={sourceHeight ?? 9999}
							value={Math.round(crop.height)}
							onChange={(e) => {
								updateCropDimension('height', Number(e.target.value));
							}}
							className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[13px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
						/>
					</div>
				</div>
			)}

			{/* Actions */}
			<div className="flex gap-2">
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
				<p className="text-[13px] text-text-tertiary">
					Pick an aspect ratio or click &ldquo;Select All&rdquo; to start cropping. Drag the handles on the
					preview to adjust.
				</p>
			)}
		</>
	);
}
