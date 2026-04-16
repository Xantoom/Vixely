import { startTransition } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection.tsx';
import { LIGHT_SLIDERS, COLOR_SLIDERS, EFFECT_SLIDERS, type FilterSliderDef } from '@/config/filterSliders.ts';
import { DEFAULT_FILTER_PARAMS } from '@/modules/shared-core/types/filters.ts';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';

const SECTIONS: { title: string; sliders: FilterSliderDef[] }[] = [
	{ title: 'Light', sliders: LIGHT_SLIDERS },
	{ title: 'Color', sliders: COLOR_SLIDERS },
	{ title: 'Effects', sliders: EFFECT_SLIDERS },
];

function countChanges(sliders: FilterSliderDef[], filters: FilterParams): number {
	let count = 0;
	for (const s of sliders) {
		if (filters[s.key] !== DEFAULT_FILTER_PARAMS[s.key]) count++;
	}
	return count;
}

export function AdjustPanel() {
	const { filters, setFilter, hasFilterChanges, resetFilters } = useVideoEditorStore(
		useShallow((s) => ({
			filters: s.filters,
			setFilter: s.setFilter,
			hasFilterChanges: s.hasFilterChanges,
			resetFilters: s.resetFilters,
		})),
	);

	const hasChanges = hasFilterChanges();

	return (
		<div className="flex flex-col gap-3">
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

			{/* Collapsible sections */}
			{SECTIONS.map((section) => (
				<CollapsibleSection
					key={section.title}
					title={section.title}
					changeCount={countChanges(section.sliders, filters)}
				>
					<FilterSliders sliders={section.sliders} filters={filters} setFilter={setFilter} />
				</CollapsibleSection>
			))}
		</div>
	);
}

function FilterSliders({
	sliders,
	filters,
	setFilter,
}: {
	sliders: FilterSliderDef[];
	filters: FilterParams;
	setFilter: <K extends keyof FilterParams>(key: K, value: FilterParams[K]) => void;
}) {
	return (
		<>
			{sliders.map((s) => {
				const value = filters[s.key];
				const defaultVal = DEFAULT_FILTER_PARAMS[s.key];
				const isChanged = value !== defaultVal;

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
								{s.format(value)}
							</span>
						</div>
						<input
							type="range"
							min={s.min}
							max={s.max}
							step={s.step}
							value={value}
							onChange={(e) => {
								const next = Number(e.target.value);
								startTransition(() => {
									setFilter(s.key, next);
								});
							}}
							className="w-full"
							aria-label={s.label}
						/>
					</div>
				);
			})}
		</>
	);
}
