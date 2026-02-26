import type { TimelineMode } from '@/hooks/useEditorLayoutPrefs.ts';

interface TimelineModeTabsProps {
	mode: TimelineMode;
	onChange: (mode: TimelineMode) => void;
}

const MODES: Array<{ id: TimelineMode; label: string }> = [
	{ id: 'full', label: 'Full' },
	{ id: 'compact', label: 'Compact' },
	{ id: 'hidden', label: 'Hide' },
];

export function TimelineModeTabs({ mode, onChange }: TimelineModeTabsProps) {
	return (
		<div className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-bg/40 p-0.5">
			{MODES.map((item) => {
				const active = mode === item.id;
				return (
					<button
						key={item.id}
						onClick={() => {
							onChange(item.id);
						}}
						className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
							active
								? 'bg-accent/15 text-accent'
								: 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/40'
						}`}
					>
						{item.label}
					</button>
				);
			})}
		</div>
	);
}
