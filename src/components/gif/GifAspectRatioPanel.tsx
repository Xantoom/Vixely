import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AspectPreset } from '@/stores/gifEditor.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';

const ASPECT_OPTIONS: { value: AspectPreset; label: string; ratio: number | null; description: string }[] = [
	{ value: 'free', label: 'Free', ratio: null, description: 'No forced aspect ratio' },
	{ value: '1:1', label: '1:1', ratio: 1, description: 'Square — Instagram, profile pics' },
	{ value: '4:3', label: '4:3', ratio: 4 / 3, description: 'Classic TV, presentations' },
	{ value: '16:9', label: '16:9', ratio: 16 / 9, description: 'Widescreen — YouTube, TikTok landscape' },
	{ value: '3:2', label: '3:2', ratio: 3 / 2, description: 'Photography standard' },
	{ value: '9:16', label: '9:16', ratio: 9 / 16, description: 'Vertical — Stories, Reels, TikTok' },
	{ value: '21:9', label: '21:9', ratio: 21 / 9, description: 'Ultrawide — Cinematic' },
];

interface GifAspectRatioPanelProps {
	sourceWidth: number | null;
	sourceHeight: number | null;
}

export function GifAspectRatioPanel({ sourceWidth, sourceHeight }: GifAspectRatioPanelProps) {
	const colorId = useId();

	const { aspectPreset, aspectPaddingColor, setAspectPreset, setAspectPaddingColor } = useGifEditorStore(
		useShallow((s) => ({
			aspectPreset: s.aspectPreset,
			aspectPaddingColor: s.aspectPaddingColor,
			setAspectPreset: s.setAspectPreset,
			setAspectPaddingColor: s.setAspectPaddingColor,
		})),
	);

	const selectedOption = ASPECT_OPTIONS.find((o) => o.value === aspectPreset);

	// Calculate padded dimensions
	let paddedWidth = sourceWidth ?? 0;
	let paddedHeight = sourceHeight ?? 0;
	if (selectedOption?.ratio && sourceWidth && sourceHeight) {
		const srcRatio = sourceWidth / sourceHeight;
		if (srcRatio > selectedOption.ratio) {
			paddedHeight = Math.round(sourceWidth / selectedOption.ratio);
		} else {
			paddedWidth = Math.round(sourceHeight * selectedOption.ratio);
		}
	}

	return (
		<>
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					Aspect Ratio
				</h3>
				<p className="text-[12px] text-text-tertiary mb-3">
					Force a specific aspect ratio by adding letterbox/pillarbox padding around the GIF.
				</p>
			</div>

			{/* Aspect Ratio Selection */}
			<div className="flex flex-col gap-1.5">
				{ASPECT_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						onClick={() => {
							setAspectPreset(opt.value);
						}}
						className={`text-left px-3 py-2 rounded-lg border cursor-pointer transition-all ${
							aspectPreset === opt.value
								? 'border-accent bg-accent/10'
								: 'border-border hover:border-border-hover bg-surface-raised/50'
						}`}
					>
						<div className="flex items-center gap-2">
							{/* Visual ratio preview */}
							<AspectBox ratio={opt.ratio} active={aspectPreset === opt.value} />
							<div className="min-w-0">
								<p className="text-[14px] font-medium text-text-secondary">{opt.label}</p>
								<p className="text-[11px] text-text-tertiary truncate">{opt.description}</p>
							</div>
						</div>
					</button>
				))}
			</div>

			{/* Padding Color */}
			{aspectPreset !== 'free' && (
				<div>
					<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
						Padding Color
					</h3>
					<div className="flex items-center gap-3">
						<input
							id={colorId}
							type="color"
							value={aspectPaddingColor}
							onChange={(e) => {
								setAspectPaddingColor(e.target.value);
							}}
							className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0.5"
						/>
						<div className="flex-1">
							<input
								type="text"
								value={aspectPaddingColor}
								onChange={(e) => {
									setAspectPaddingColor(e.target.value);
								}}
								className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text focus:outline-none focus:border-accent/50"
							/>
						</div>
					</div>

					{/* Quick colors */}
					<div className="flex gap-1.5 mt-2">
						{['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff'].map((c) => (
							<button
								key={c}
								onClick={() => {
									setAspectPaddingColor(c);
								}}
								className={`w-7 h-7 rounded-md border cursor-pointer transition-all ${
									aspectPaddingColor === c ? 'border-accent scale-110' : 'border-border'
								}`}
								style={{ backgroundColor: c }}
								title={c}
								aria-label={`Set padding color to ${c}`}
							/>
						))}
					</div>
				</div>
			)}

			{/* Dimension preview */}
			{aspectPreset !== 'free' && sourceWidth && sourceHeight && (
				<div className="rounded-lg bg-accent/5 border border-accent/20 px-3 py-2">
					<p className="text-[14px] text-accent font-medium">Padded Output</p>
					<p className="text-[12px] text-text-tertiary mt-0.5">
						{sourceWidth}×{sourceHeight} → {paddedWidth}×{paddedHeight}
					</p>
					{paddedWidth > sourceWidth && (
						<p className="text-[11px] text-text-tertiary mt-0.5">
							Pillarbox: +{paddedWidth - sourceWidth}px horizontal padding
						</p>
					)}
					{paddedHeight > sourceHeight && (
						<p className="text-[11px] text-text-tertiary mt-0.5">
							Letterbox: +{paddedHeight - sourceHeight}px vertical padding
						</p>
					)}
				</div>
			)}
		</>
	);
}

function AspectBox({ ratio, active }: { ratio: number | null; active: boolean }) {
	const w = ratio ? (ratio >= 1 ? 24 : Math.round(24 * ratio)) : 20;
	const h = ratio ? (ratio >= 1 ? Math.round(24 / ratio) : 24) : 20;
	return (
		<div
			className={`shrink-0 rounded-sm border-2 ${active ? 'border-accent' : 'border-border'}`}
			style={{ width: `${w}px`, height: `${h}px` }}
		/>
	);
}
