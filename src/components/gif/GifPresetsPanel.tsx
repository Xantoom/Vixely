import { useMemo } from 'react';
import { SharedPresetsPanel, type PresetEntry } from '@/components/shared/PresetsPanel.tsx';
import type { GifPreset } from '@/config/presets.ts';

interface GifPresetsPanelProps {
	presets: [string, GifPreset][];
	selectedPreset: string | null;
	onSelectPreset: (key: string | null) => void;
}

export function GifPresetsPanel({ presets, selectedPreset, onSelectPreset }: GifPresetsPanelProps) {
	const entries: PresetEntry[] = useMemo(
		() =>
			presets.map(([key, preset]) => ({
				key,
				name: preset.name,
				subtitle: `${preset.width}px · ${preset.fps}fps${preset.maxDuration ? ` · ${preset.maxDuration}s max` : ''}`,
			})),
		[presets],
	);

	return (
		<SharedPresetsPanel
			presets={entries}
			selectedPreset={selectedPreset}
			onSelectPreset={onSelectPreset}
			emptyLabel="Pick a preset optimized for your target platform."
			fallbackIconLetter="G"
		/>
	);
}
