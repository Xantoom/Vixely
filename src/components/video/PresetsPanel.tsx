import { useMemo } from 'react';
import { SharedPresetsPanel, type PresetEntry } from '@/components/shared/PresetsPanel.tsx';

interface Preset {
	name: string;
	description: string;
}

interface PresetsGroup {
	platform: string;
	presets: [string, Preset][];
}

interface PresetsPanelProps {
	groupedPresets: PresetsGroup[];
	selectedPreset: string | null;
	onSelectPreset: (key: string | null) => void;
}

export function PresetsPanel({ groupedPresets, selectedPreset, onSelectPreset }: PresetsPanelProps) {
	const entries: PresetEntry[] = useMemo(
		() =>
			groupedPresets.flatMap((g) =>
				g.presets.map(([key, preset]) => ({ key, name: preset.name, subtitle: preset.description })),
			),
		[groupedPresets],
	);

	return (
		<SharedPresetsPanel
			presets={entries}
			selectedPreset={selectedPreset}
			onSelectPreset={onSelectPreset}
			emptyLabel="Pick a preset optimized for your target platform, then export."
			fallbackIconLetter="V"
		/>
	);
}
