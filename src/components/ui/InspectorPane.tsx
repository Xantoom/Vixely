import type { ReactNode } from 'react';

interface InspectorPaneProps {
	width: number;
	children: ReactNode;
	ariaLabel: string;
}

export function InspectorPane({ width, children, ariaLabel }: InspectorPaneProps) {
	return (
		<aside
			className="flex shrink-0 min-w-0 overflow-hidden border-l border-border bg-surface flex-col"
			style={{ width: `${width}px` }}
			aria-label={ariaLabel}
		>
			<div className="h-full min-w-0 overflow-hidden flex flex-col">{children}</div>
		</aside>
	);
}
