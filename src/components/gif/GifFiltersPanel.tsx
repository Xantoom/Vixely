import { useShallow } from 'zustand/react/shallow';
import { AdjustmentPanel, type AdjustmentBindings } from '@/components/shared/AdjustmentPanel.tsx';
import { useGifEditorStore } from '@/stores/gifEditor.ts';

export function GifFiltersPanel() {
	const { filters, lookId, lookIntensity, setFilter, setLook, setLookIntensity, resetFilters, hasFilterChanges } =
		useGifEditorStore(
			useShallow((s) => ({
				filters: s.filters,
				lookId: s.lookId,
				lookIntensity: s.lookIntensity,
				setFilter: s.setFilter,
				setLook: s.setLook,
				setLookIntensity: s.setLookIntensity,
				resetFilters: s.resetFilters,
				hasFilterChanges: s.hasFilterChanges,
			})),
		);

	const bindings: AdjustmentBindings = {
		filters,
		lookId,
		lookIntensity,
		hasChanges: hasFilterChanges(),
		setFilter,
		setLook,
		setLookIntensity,
		resetFilters,
	};

	return <AdjustmentPanel bindings={bindings} />;
}
