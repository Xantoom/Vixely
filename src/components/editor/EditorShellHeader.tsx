import type { ReactNode } from 'react';

interface EditorShellHeaderProps {
	title: string;
	description: string;
	modeSwitch?: ReactNode;
	badge?: ReactNode;
	stageTabs?: ReactNode;
	actions?: ReactNode;
	fileSummary?: ReactNode;
}

export function EditorShellHeader({
	title,
	description,
	modeSwitch,
	badge,
	stageTabs,
	actions,
	fileSummary,
}: EditorShellHeaderProps) {
	return (
		<div className="p-4 border-b border-border/70 bg-surface-raised/20">
			<div className="mb-3 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-tertiary">{title}</p>
					<p className="text-[13px] text-text-secondary">{description}</p>
				</div>
				{(modeSwitch || badge) && (
					<div className="shrink-0 flex items-center gap-2">
						{modeSwitch}
						{badge}
					</div>
				)}
			</div>

			{stageTabs && <div className="mb-3">{stageTabs}</div>}

			{actions && <div className="flex gap-2">{actions}</div>}

			{fileSummary && <div className="mt-2">{fileSummary}</div>}
		</div>
	);
}
