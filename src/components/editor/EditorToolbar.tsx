import type { ReactNode } from 'react';

interface EditorToolbarProps {
	children: ReactNode;
}

export function EditorToolbar({ children }: EditorToolbarProps) {
	return (
		<div className="h-11 flex items-center px-2 gap-0.5 border-b border-border bg-surface shrink-0 select-none overflow-x-auto">
			{children}
		</div>
	);
}
