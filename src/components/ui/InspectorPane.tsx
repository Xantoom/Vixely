import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ReactNode } from 'react';

interface InspectorPaneProps {
	width: number;
	children: ReactNode;
	ariaLabel: string;
	collapsible?: boolean;
	collapsed?: boolean;
	onToggleCollapse?: () => void;
}

export function InspectorPane({
	width,
	children,
	ariaLabel,
	collapsible = false,
	collapsed = false,
	onToggleCollapse,
}: InspectorPaneProps) {
	if (collapsible && collapsed) {
		return (
			<aside className="shrink-0 border-l border-border bg-surface flex flex-col items-center py-2">
				<button
					type="button"
					onClick={onToggleCollapse}
					className="h-8 w-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/40 transition-colors cursor-pointer"
					aria-label={`Expand ${ariaLabel}`}
					title="Expand sidebar"
				>
					<PanelRightOpen size={16} />
				</button>
			</aside>
		);
	}

	return (
		<aside
			className="flex shrink-0 min-w-0 overflow-hidden border-l border-border bg-surface flex-col"
			style={{ width: `${width}px` }}
			aria-label={ariaLabel}
		>
			{collapsible && onToggleCollapse && (
				<button
					type="button"
					onClick={onToggleCollapse}
					className="absolute left-2 top-2 z-10 h-7 w-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/40 transition-colors cursor-pointer"
					aria-label={`Collapse ${ariaLabel}`}
					title="Collapse sidebar"
				>
					<PanelRightClose size={14} />
				</button>
			)}
			<div className="h-full min-w-0 overflow-hidden flex flex-col">{children}</div>
		</aside>
	);
}
