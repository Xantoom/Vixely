import { useShallow } from 'zustand/react/shallow';
import { Slider } from '@/components/ui/index.ts';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';

const sliders = [
	{
		key: 'brightness' as const,
		label: 'Brightness',
		min: -0.5,
		max: 0.5,
		step: 0.01,
		fmt: (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`,
	},
	{
		key: 'contrast' as const,
		label: 'Contrast',
		min: 0.2,
		max: 3,
		step: 0.01,
		fmt: (v: number) => (v * 100).toFixed(0),
	},
	{
		key: 'saturation' as const,
		label: 'Saturation',
		min: 0,
		max: 3,
		step: 0.01,
		fmt: (v: number) => (v * 100).toFixed(0),
	},
	{
		key: 'hue' as const,
		label: 'Hue',
		min: -180,
		max: 180,
		step: 1,
		fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}\u00b0`,
	},
];

export function ColorCorrectionPanel() {
	const { filters, setFilter, resetFilters } = useVideoEditorStore(
		useShallow((s) => ({ filters: s.filters, setFilter: s.setFilter, resetFilters: s.resetFilters })),
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider">
					Color Correction
				</h3>
				<button
					onClick={resetFilters}
					className="text-[14px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
				>
					Reset
				</button>
			</div>

			{sliders.map((s) => (
				<Slider
					key={s.key}
					label={s.label}
					displayValue={s.fmt(filters[s.key])}
					min={s.min}
					max={s.max}
					step={s.step}
					value={filters[s.key]}
					onChange={(e) => {
						setFilter(s.key, Number((e.target as HTMLInputElement).value));
					}}
				/>
			))}

			<p className="text-[14px] text-text-tertiary leading-relaxed">
				Preview is real-time. Filters are applied during export via Mediabunny.
			</p>
		</div>
	);
}
