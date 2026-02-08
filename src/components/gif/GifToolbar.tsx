import { LayoutGrid, Gauge, Maximize, Download } from 'lucide-react';
import { useGifEditorStore, type GifMode } from '@/stores/gifEditor.ts';

const tabs: { mode: GifMode; label: string; icon: typeof LayoutGrid }[] = [
	{ mode: 'settings', label: 'Settings', icon: LayoutGrid },
	{ mode: 'speed', label: 'Speed', icon: Gauge },
	{ mode: 'resize', label: 'Resize', icon: Maximize },
	{ mode: 'export', label: 'Export', icon: Download },
];

export function GifToolbar() {
	const { mode, setMode } = useGifEditorStore();

	return (
		<div className="flex border-b border-border bg-surface shrink-0">
			{tabs.map((tab) => {
				const isActive = mode === tab.mode;
				return (
					<button
						key={tab.mode}
						onClick={() => setMode(tab.mode)}
						className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
							isActive
								? 'text-accent border-b-2 border-accent'
								: 'text-text-tertiary hover:text-text-secondary'
						}`}
					>
						<tab.icon size={14} />
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
