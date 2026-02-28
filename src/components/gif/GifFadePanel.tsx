import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { FadeColor } from '@/stores/gifEditor.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';

const FADE_COLORS: { value: FadeColor; label: string; swatch: string }[] = [
	{ value: 'black', label: 'Black', swatch: '#000000' },
	{ value: 'white', label: 'White', swatch: '#ffffff' },
	{ value: 'transparent', label: 'Transparent', swatch: 'transparent' },
];

export function GifFadePanel() {
	const fadeInId = useId();
	const fadeOutId = useId();

	const { fadeInDuration, fadeOutDuration, fadeColor, setFadeInDuration, setFadeOutDuration, setFadeColor } =
		useGifEditorStore(
			useShallow((s) => ({
				fadeInDuration: s.fadeInDuration,
				fadeOutDuration: s.fadeOutDuration,
				fadeColor: s.fadeColor,
				setFadeInDuration: s.setFadeInDuration,
				setFadeOutDuration: s.setFadeOutDuration,
				setFadeColor: s.setFadeColor,
			})),
		);

	return (
		<>
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					Fade Effects
				</h3>
				<p className="text-[12px] text-text-tertiary mb-3">
					Add fade-in and fade-out effects to the beginning and end of the GIF.
				</p>
			</div>

			{/* Fade In */}
			<div>
				<label htmlFor={fadeInId} className="text-[14px] font-medium text-text-secondary mb-1.5 block">
					Fade In — {fadeInDuration.toFixed(1)}s
				</label>
				<input
					id={fadeInId}
					type="range"
					min={0}
					max={3}
					step={0.1}
					value={fadeInDuration}
					onChange={(e) => {
						setFadeInDuration(Number(e.target.value));
					}}
					className="w-full accent-accent"
				/>
				<div className="flex justify-between text-[11px] text-text-tertiary mt-0.5">
					<span>Off</span>
					<span>3s</span>
				</div>
			</div>

			{/* Fade Out */}
			<div>
				<label htmlFor={fadeOutId} className="text-[14px] font-medium text-text-secondary mb-1.5 block">
					Fade Out — {fadeOutDuration.toFixed(1)}s
				</label>
				<input
					id={fadeOutId}
					type="range"
					min={0}
					max={3}
					step={0.1}
					value={fadeOutDuration}
					onChange={(e) => {
						setFadeOutDuration(Number(e.target.value));
					}}
					className="w-full accent-accent"
				/>
				<div className="flex justify-between text-[11px] text-text-tertiary mt-0.5">
					<span>Off</span>
					<span>3s</span>
				</div>
			</div>

			{/* Fade Color */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
					Fade Color
				</h3>
				<div className="flex gap-2">
					{FADE_COLORS.map((c) => (
						<button
							key={c.value}
							onClick={() => {
								setFadeColor(c.value);
							}}
							className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
								fadeColor === c.value
									? 'border-accent bg-accent/10'
									: 'border-border hover:border-border-hover bg-surface-raised/50'
							}`}
						>
							<span
								className="w-4 h-4 rounded-sm border border-border shrink-0"
								style={{
									backgroundColor: c.swatch === 'transparent' ? undefined : c.swatch,
									backgroundImage:
										c.swatch === 'transparent'
											? 'linear-gradient(45deg, #808080 25%, transparent 25%, transparent 75%, #808080 75%, #808080), linear-gradient(45deg, #808080 25%, transparent 25%, transparent 75%, #808080 75%, #808080)'
											: undefined,
									backgroundSize: c.swatch === 'transparent' ? '8px 8px' : undefined,
									backgroundPosition: c.swatch === 'transparent' ? '0 0, 4px 4px' : undefined,
								}}
							/>
							<span className="text-[12px] font-medium text-text-secondary">{c.label}</span>
						</button>
					))}
				</div>
			</div>

			{/* Preview indication */}
			{(fadeInDuration > 0 || fadeOutDuration > 0) && (
				<div className="rounded-lg bg-accent/5 border border-accent/20 px-3 py-2">
					<p className="text-[14px] text-accent font-medium">Fade applied</p>
					<p className="text-[12px] text-text-tertiary mt-0.5">
						{fadeInDuration > 0 && `In: ${fadeInDuration.toFixed(1)}s`}
						{fadeInDuration > 0 && fadeOutDuration > 0 && ' · '}
						{fadeOutDuration > 0 && `Out: ${fadeOutDuration.toFixed(1)}s`}
						{' → '}
						{fadeColor}
					</p>
				</div>
			)}

			{fadeInDuration === 0 && fadeOutDuration === 0 && (
				<p className="text-[14px] text-text-tertiary/60 text-center py-6">
					Drag the sliders to add fade effects
				</p>
			)}
		</>
	);
}
