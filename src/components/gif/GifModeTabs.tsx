import {
	Crop,
	Layers,
	RotateCw,
	Palette,
	Type,
	Zap,
	Settings,
	Maximize2,
	Download,
	ImagePlus,
	ImageUp,
	Blend,
	Search,
	FileOutput,
	Ratio,
} from 'lucide-react';
import type { GifMode } from '@/stores/gifEditor.ts';

export const GIF_MODE_TABS: { mode: GifMode; label: string; icon: typeof Settings }[] = [
	{ mode: 'settings', label: 'Settings', icon: Settings },
	{ mode: 'crop', label: 'Crop', icon: Crop },
	{ mode: 'resize', label: 'Resize', icon: Maximize2 },
	{ mode: 'rotate', label: 'Rotate', icon: RotateCw },
	{ mode: 'filters', label: 'Filters', icon: Palette },
	{ mode: 'optimize', label: 'Optimize', icon: Zap },
	{ mode: 'frames', label: 'Frames', icon: Layers },
	{ mode: 'text', label: 'Text', icon: Type },
	{ mode: 'maker', label: 'Maker', icon: ImagePlus },
	{ mode: 'overlay', label: 'Overlay', icon: ImageUp },
	{ mode: 'fade', label: 'Fade', icon: Blend },
	{ mode: 'analyze', label: 'Analyze', icon: Search },
	{ mode: 'convert', label: 'Convert', icon: FileOutput },
	{ mode: 'aspect', label: 'Ratio', icon: Ratio },
	{ mode: 'export', label: 'Export', icon: Download },
];

interface GifModeTabsProps {
	mode: GifMode;
	onModeChange: (mode: GifMode) => void;
}

export function GifModeTabs({ mode, onModeChange }: GifModeTabsProps) {
	return (
		<div className="flex border-b border-border bg-surface overflow-x-auto">
			{GIF_MODE_TABS.map((tab) => {
				const isActive = mode === tab.mode;
				return (
					<button
						key={tab.mode}
						onClick={() => {
							onModeChange(tab.mode);
						}}
						className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[11px] font-semibold uppercase tracking-wider transition-all cursor-pointer min-w-0 ${
							isActive
								? 'text-accent border-b-2 border-accent'
								: 'text-text-tertiary hover:text-text-secondary'
						}`}
					>
						<tab.icon size={14} />
						<span className="truncate">{tab.label}</span>
					</button>
				);
			})}
		</div>
	);
}
