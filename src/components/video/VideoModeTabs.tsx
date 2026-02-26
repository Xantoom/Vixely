import { Layers, Scissors, Scaling, Palette, Download } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { EditorModeTabs, type EditorModeTabItem } from '@/components/ui/index.ts';
import { useVideoEditorStore, type VideoMode } from '@/stores/videoEditor.ts';

interface VideoModeTabsProps {
	hasTrimChanges?: boolean;
	selectedPreset?: string | null;
	modes?: VideoMode[];
}

const TABS: EditorModeTabItem<VideoMode>[] = [
	{ id: 'presets', label: 'Presets', icon: Layers },
	{ id: 'trim', label: 'Trim', icon: Scissors },
	{ id: 'resize', label: 'Resize', icon: Scaling },
	{ id: 'adjust', label: 'Adjust', icon: Palette },
	{ id: 'export', label: 'Export', icon: Download },
];

export function VideoModeTabs({ hasTrimChanges = false, selectedPreset = null, modes }: VideoModeTabsProps) {
	const { mode, setMode, filters, resize } = useVideoEditorStore(
		useShallow((s) => ({ mode: s.mode, setMode: s.setMode, filters: s.filters, resize: s.resize })),
	);

	const hasColorChanges =
		filters.brightness !== 0 || filters.contrast !== 1 || filters.saturation !== 1 || filters.hue !== 0;
	const hasResizeChanges =
		resize.originalWidth > 0 && (resize.width !== resize.originalWidth || resize.height !== resize.originalHeight);

	const activity: Record<VideoMode, boolean> = {
		presets: selectedPreset != null,
		trim: hasTrimChanges,
		resize: hasResizeChanges,
		adjust: hasColorChanges,
		export: false,
	};
	const availableModes = modes && modes.length > 0 ? modes : TABS.map((tab) => tab.id);
	const items = TABS.filter((tab) => availableModes.includes(tab.id)).map((tab) => ({
		...tab,
		hasActivity: activity[tab.id],
	}));

	return (
		<div className="shrink-0 border-b border-border/70 bg-surface-raised/15">
			<EditorModeTabs value={mode} items={items} onChange={setMode} ariaLabel="Video editor mode tabs" />
		</div>
	);
}
