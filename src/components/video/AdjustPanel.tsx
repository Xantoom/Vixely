import { useShallow } from 'zustand/react/shallow';
import { AdjustmentPanel, type AdjustmentBindings } from '@/components/shared/AdjustmentPanel.tsx';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';

export function AdjustPanel() {
	const { filters, lookId, lookIntensity, setFilter, setLook, setLookIntensity, resetFilters, hasFilterChanges } =
		useVideoEditorStore(
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
