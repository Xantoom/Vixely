import { useShallow } from 'zustand/react/shallow';
import { Button, Slider } from '@/components/ui/index.ts';
import { LIGHT_SLIDERS, COLOR_SLIDERS, EFFECT_SLIDERS, type FilterSliderDef } from '@/config/filterSliders.ts';
import { filterPresetEntries } from '@/config/presets.ts';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';

const FILTER_PRESETS = filterPresetEntries();

const QUICK_PRESETS: { label: string; filters: Partial<FilterParams> }[] = [
	{ label: 'Grayscale', filters: { saturation: 0 } },
	{ label: 'Negative', filters: { exposure: -1, brightness: 1 } },
	{ label: 'Vintage', filters: { sepia: 0.6, contrast: 1.2, saturation: 0.8, vignette: 0.3 } },
	{ label: 'Cinematic', filters: { contrast: 1.3, saturation: 0.85, temperature: 0.1, vignette: 0.25 } },
	{ label: 'Cool', filters: { temperature: -0.4, saturation: 0.9 } },
	{ label: 'Warm', filters: { temperature: 0.4, saturation: 1.1 } },
	{ label: 'High Contrast', filters: { contrast: 2, brightness: 0.05 } },
	{ label: 'Faded', filters: { contrast: 0.8, brightness: 0.1, saturation: 0.7 } },
];

function SliderGroup({ sliders, groupLabel }: { sliders: FilterSliderDef[]; groupLabel: string }) {
	const { filters, setFilter } = useGifEditorStore(
		useShallow((s) => ({ filters: s.filters, setFilter: s.setFilter })),
	);

	return (
		<div>
			<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">{groupLabel}</h3>
			<div className="flex flex-col gap-3">
				{sliders.map((def) => (
					<Slider
						key={def.key}
						label={def.label}
						displayValue={def.format(filters[def.key])}
						min={def.min}
						max={def.max}
						step={def.step}
						value={filters[def.key]}
						onChange={(e) => {
							setFilter(def.key, Number(e.target.value));
						}}
					/>
				))}
			</div>
		</div>
	);
}

export function GifFiltersPanel() {
	const { setFilter, resetFilters, hasFilterChanges } = useGifEditorStore(
		useShallow((s) => ({
			setFilter: s.setFilter,
			resetFilters: s.resetFilters,
			hasFilterChanges: s.hasFilterChanges,
		})),
	);

	const applyQuickPreset = (preset: Partial<FilterParams>) => {
		resetFilters();
		for (const [key, value] of Object.entries(preset)) {
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion
			setFilter(key as keyof FilterParams, value);
		}
	};

	return (
		<>
			{/* Quick Filter Presets */}
			<div>
				<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
					Quick Filters
				</h3>
				<div className="grid grid-cols-2 gap-1.5">
					{QUICK_PRESETS.map((preset) => (
						<button
							key={preset.label}
							onClick={() => {
								applyQuickPreset(preset.filters);
							}}
							className="rounded-lg px-2.5 py-2 text-left cursor-pointer bg-surface-raised/50 border border-transparent text-text-secondary hover:bg-surface-raised hover:text-text transition-all"
						>
							<p className="text-[14px] font-medium">{preset.label}</p>
						</button>
					))}
				</div>
			</div>

			{/* Saved filter presets from config */}
			{FILTER_PRESETS.length > 0 && (
				<div>
					<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
						Saved Presets
					</h3>
					<div className="grid grid-cols-2 gap-1.5">
						{FILTER_PRESETS.map(([key, preset]) => (
							<button
								key={key}
								onClick={() => {
									applyQuickPreset(preset);
								}}
								className="rounded-lg px-2.5 py-2 text-left cursor-pointer bg-surface-raised/50 border border-transparent text-text-secondary hover:bg-surface-raised hover:text-text transition-all"
							>
								<p className="text-[14px] font-medium truncate">{preset.name}</p>
							</button>
						))}
					</div>
				</div>
			)}

			<SliderGroup sliders={LIGHT_SLIDERS} groupLabel="Light" />
			<SliderGroup sliders={COLOR_SLIDERS} groupLabel="Color" />
			<SliderGroup sliders={EFFECT_SLIDERS} groupLabel="Effects" />

			{/* Reset */}
			{hasFilterChanges() && (
				<Button variant="ghost" size="sm" onClick={resetFilters}>
					Reset All Filters
				</Button>
			)}
		</>
	);
}
