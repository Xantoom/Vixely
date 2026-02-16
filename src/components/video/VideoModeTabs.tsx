import { Palette, Scissors, Download, LayoutGrid } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useVideoEditorStore, type VideoMode } from '@/stores/videoEditor.ts';

const tabs: { mode: VideoMode; label: string; icon: typeof Palette }[] = [
	{ mode: 'presets', label: 'Presets', icon: LayoutGrid },
	{ mode: 'adjust', label: 'Adjust', icon: Palette },
	{ mode: 'trim', label: 'Trim', icon: Scissors },
	{ mode: 'export', label: 'Export', icon: Download },
];

export function VideoModeTabs() {
	const { mode, setMode } = useVideoEditorStore(useShallow((s) => ({ mode: s.mode, setMode: s.setMode })));

	return (
		<div className="flex border-b border-border bg-surface">
			{tabs.map((tab) => {
				const isActive = mode === tab.mode;
				return (
					<button
						key={tab.mode}
						onClick={() => {
							setMode(tab.mode);
						}}
						className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[13px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
							isActive
								? 'text-accent border-b-2 border-accent'
								: 'text-text-tertiary hover:text-text-secondary'
						}`}
					>
						<tab.icon size={16} />
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
