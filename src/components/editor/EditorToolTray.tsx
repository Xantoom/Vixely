import type { ReactNode } from 'react';

interface EditorToolTrayProps {
	children: ReactNode;
}

export function EditorToolTray({ children }: EditorToolTrayProps) {
	return (
		<div className="shrink-0 h-14 border-t border-border bg-surface flex items-center overflow-x-auto overscroll-x-contain scroll-smooth tool-tray-mask">
			{children}
		</div>
	);
}
