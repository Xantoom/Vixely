import { Layers, Scissors, Scaling, Palette, Download } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useVideoEditorStore, type VideoMode } from '@/stores/videoEditor.ts';

interface VideoModeTabsProps {
	hasTrimChanges?: boolean;
	selectedPreset?: string | null;
}

const TABS: { mode: VideoMode; label: string; icon: typeof Layers }[] = [
	{ mode: 'presets', label: 'Presets', icon: Layers },
	{ mode: 'trim', label: 'Trim', icon: Scissors },
	{ mode: 'resize', label: 'Resize', icon: Scaling },
	{ mode: 'adjust', label: 'Adjust', icon: Palette },
	{ mode: 'export', label: 'Export', icon: Download },
];

export function VideoModeTabs({ hasTrimChanges = false, selectedPreset = null }: VideoModeTabsProps) {
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

	return (
		<div className="flex shrink-0 overflow-x-auto border-b border-border bg-surface">
			{TABS.map((tab) => {
				const isActive = mode === tab.mode;
				const hasActivity = activity[tab.mode];

				return (
					<button
						key={tab.mode}
						onClick={() => {
							setMode(tab.mode);
						}}
						className={`relative flex min-w-0 flex-1 cursor-pointer select-none flex-col items-center gap-1 py-3 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
							isActive ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'
						}`}
					>
						{/* Active underline */}
						{isActive && <div className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-accent" />}

						{/* Icon + activity dot */}
						<div className="relative">
							<tab.icon size={15} strokeWidth={isActive ? 2.2 : 1.8} />
							{hasActivity && (
								<div
									className={`absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full ${
										isActive ? 'bg-accent' : 'bg-accent/60'
									}`}
								/>
							)}
						</div>

						<span>{tab.label}</span>
					</button>
				);
			})}
		</div>
	);
}
