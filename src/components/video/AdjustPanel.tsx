import { useShallow } from 'zustand/react/shallow';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';

const SLIDERS = [
	{
		key: 'brightness' as const,
		label: 'Brightness',
		min: -0.5,
		max: 0.5,
		step: 0.01,
		defaultVal: 0,
		fmt: (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`,
	},
	{
		key: 'contrast' as const,
		label: 'Contrast',
		min: 0.2,
		max: 3,
		step: 0.01,
		defaultVal: 1,
		fmt: (v: number) => `${Math.round(v * 100)}%`,
	},
	{
		key: 'saturation' as const,
		label: 'Saturation',
		min: 0,
		max: 3,
		step: 0.01,
		defaultVal: 1,
		fmt: (v: number) => `${Math.round(v * 100)}%`,
	},
	{
		key: 'hue' as const,
		label: 'Hue',
		min: -180,
		max: 180,
		step: 1,
		defaultVal: 0,
		fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}°`,
	},
];

export function AdjustPanel() {
	const { filters, setFilter, resetFilters } = useVideoEditorStore(
		useShallow((s) => ({ filters: s.filters, setFilter: s.setFilter, resetFilters: s.resetFilters })),
	);

	const hasChanges =
		filters.brightness !== 0 || filters.contrast !== 1 || filters.saturation !== 1 || filters.hue !== 0;

	return (
		<div className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
					Color Correction
				</h3>
				{hasChanges && (
					<button
						onClick={resetFilters}
						className="cursor-pointer text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
					>
						Reset all
					</button>
				)}
			</div>

			{/* Sliders */}
			<div className="flex flex-col gap-4">
				{SLIDERS.map((s) => {
					const isChanged = filters[s.key] !== s.defaultVal;

					return (
						<div key={s.key} className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between">
								<label
									className={`text-[13px] font-medium transition-colors ${
										isChanged ? 'text-text' : 'text-text-secondary'
									}`}
								>
									{s.label}
								</label>
								<span
									className={`font-mono text-[13px] tabular-nums transition-colors ${
										isChanged ? 'text-accent' : 'text-text-tertiary'
									}`}
								>
									{s.fmt(filters[s.key])}
								</span>
							</div>
							<input
								type="range"
								min={s.min}
								max={s.max}
								step={s.step}
								value={filters[s.key]}
								onChange={(e) => {
									setFilter(s.key, Number(e.target.value));
								}}
								className="w-full"
								aria-label={s.label}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
