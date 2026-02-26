import { Download, SlidersHorizontal, Upload } from 'lucide-react';
import type { EditorStage } from '@/hooks/useEditorLayoutPrefs.ts';

interface EditorStageTabsProps {
	stage: EditorStage;
	onChange: (stage: EditorStage) => void;
}

const STAGES: Array<{ id: EditorStage; label: string; icon: typeof Upload }> = [
	{ id: 'source', label: 'Source', icon: Upload },
	{ id: 'edit', label: 'Edit', icon: SlidersHorizontal },
	{ id: 'output', label: 'Output', icon: Download },
];

export function EditorStageTabs({ stage, onChange }: EditorStageTabsProps) {
	return (
		<div className="grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-bg/35 p-1">
			{STAGES.map((item) => {
				const active = stage === item.id;
				return (
					<button
						key={item.id}
						type="button"
						onClick={() => {
							onChange(item.id);
						}}
						className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 cursor-pointer ${
							active
								? 'bg-accent/14 text-accent ring-1 ring-accent/35'
								: 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/40'
						}`}
					>
						<item.icon size={13} strokeWidth={active ? 2.2 : 1.9} />
						{item.label}
					</button>
				);
			})}
		</div>
	);
}
