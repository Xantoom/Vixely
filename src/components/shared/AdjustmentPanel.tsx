import { startTransition } from 'react';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection.tsx';
import { Slider } from '@/components/ui/Slider.tsx';
import {
	ESSENTIAL_SLIDERS,
	ADVANCED_COLOR_SLIDERS,
	EFFECT_SLIDERS,
	type FilterSliderDef,
} from '@/config/filterSliders.ts';
import { LOOKS } from '@/config/looks.ts';
import { DEFAULT_FILTER_PARAMS } from '@/modules/shared-core/types/filters.ts';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';

export interface AdjustmentBindings {
	filters: FilterParams;
	lookId: string | null;
	lookIntensity: number;
	hasChanges: boolean;
	setFilter: <K extends keyof FilterParams>(key: K, value: FilterParams[K]) => void;
	setLook: (id: string | null) => void;
	setLookIntensity: (intensity: number) => void;
	resetFilters: () => void;
	/** Optional commit hook — image editor uses this to push history entries. */
	onCommit?: () => void;
}

function countChanges(sliders: FilterSliderDef[], filters: FilterParams): number {
	let count = 0;
	for (const s of sliders) {
		if (filters[s.key] !== DEFAULT_FILTER_PARAMS[s.key]) count++;
	}
	return count;
}

export function AdjustmentPanel({ bindings }: { bindings: AdjustmentBindings }) {
	const { filters, lookId, lookIntensity, hasChanges, setFilter, setLook, setLookIntensity, resetFilters, onCommit } =
		bindings;

	return (
		<div className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h3 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Adjust</h3>
				{hasChanges && (
					<button
						onClick={resetFilters}
						className="cursor-pointer text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
					>
						Reset all
					</button>
				)}
			</div>

			{/* Looks */}
			<div className="flex flex-col gap-2">
				<h4 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Looks</h4>
				<div className="grid grid-cols-3 gap-1.5">
					<button
						type="button"
						onClick={() => {
							setLook(null);
							onCommit?.();
						}}
						className={`rounded-md py-2 text-[13px] font-medium transition-all cursor-pointer ${
							lookId === null
								? 'bg-accent/15 text-accent border border-accent/30'
								: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised hover:text-text'
						}`}
					>
						None
					</button>
					{LOOKS.map((look) => (
						<button
							key={look.id}
							type="button"
							onClick={() => {
								setLook(look.id);
								onCommit?.();
							}}
							className={`rounded-md py-2 text-[13px] font-medium transition-all cursor-pointer ${
								lookId === look.id
									? 'bg-accent/15 text-accent border border-accent/30'
									: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised hover:text-text'
							}`}
						>
							{look.name}
						</button>
					))}
				</div>
				{lookId !== null && (
					<Slider
						label="Intensity"
						displayValue={`${Math.round(lookIntensity * 100)}%`}
						min={0}
						max={1}
						step={0.01}
						value={lookIntensity}
						onChange={(e) => {
							const next = Number(e.currentTarget.value);
							startTransition(() => {
								setLookIntensity(next);
							});
						}}
						onCommit={onCommit}
					/>
				)}
			</div>

			{/* Essentials */}
			<div className="flex flex-col gap-3">
				{ESSENTIAL_SLIDERS.map((s) => (
					<FilterSlider key={s.key} def={s} filters={filters} setFilter={setFilter} onCommit={onCommit} />
				))}
			</div>

			{/* Advanced colour */}
			<CollapsibleSection
				title="Advanced color"
				changeCount={countChanges(ADVANCED_COLOR_SLIDERS, filters)}
				defaultCollapsed
			>
				{ADVANCED_COLOR_SLIDERS.map((s) => (
					<FilterSlider key={s.key} def={s} filters={filters} setFilter={setFilter} onCommit={onCommit} />
				))}
			</CollapsibleSection>

			{/* Effects */}
			<CollapsibleSection title="Effects" changeCount={countChanges(EFFECT_SLIDERS, filters)} defaultCollapsed>
				{EFFECT_SLIDERS.map((s) => (
					<FilterSlider key={s.key} def={s} filters={filters} setFilter={setFilter} onCommit={onCommit} />
				))}
			</CollapsibleSection>
		</div>
	);
}

function FilterSlider({
	def,
	filters,
	setFilter,
	onCommit,
}: {
	def: FilterSliderDef;
	filters: FilterParams;
	setFilter: <K extends keyof FilterParams>(key: K, value: FilterParams[K]) => void;
	onCommit?: () => void;
}) {
	const value = filters[def.key];
	return (
		<Slider
			label={def.label}
			displayValue={def.format(value)}
			min={def.min}
			max={def.max}
			step={def.step}
			value={value}
			onChange={(e) => {
				const next = Number(e.currentTarget.value);
				startTransition(() => {
					setFilter(def.key, next);
				});
			}}
			onCommit={onCommit}
		/>
	);
}
