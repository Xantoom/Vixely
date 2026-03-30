import { useEffect, useRef, useCallback, type ReactNode } from 'react';

interface FloatingPanelProps {
	open: boolean;
	onClose: () => void;
	width?: number;
	children: ReactNode;
	ariaLabel?: string;
}

export function FloatingPanel({
	open,
	onClose,
	width = 320,
	children,
	ariaLabel = 'Tool settings',
}: FloatingPanelProps) {
	const panelRef = useRef<HTMLDivElement>(null);

	const handleClickOutside = useCallback(
		(e: MouseEvent) => {
			if (!panelRef.current) return;
			if (e.target instanceof Node && !panelRef.current.contains(e.target)) {
				onClose();
			}
		},
		[onClose],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		},
		[onClose],
	);

	useEffect(() => {
		if (!open) return;
		// Delay listener to avoid catching the click that opened the panel
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
		}, 10);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [open, handleClickOutside, handleKeyDown]);

	if (!open) return null;

	return (
		<aside
			ref={panelRef}
			className="absolute top-0 right-12 bottom-0 z-30 flex flex-col bg-surface/95 backdrop-blur-md border-l border-border shadow-2xl animate-slide-in-right"
			style={{ width: `${width}px` }}
			aria-label={ariaLabel}
		>
			<div className="h-full min-w-0 overflow-hidden flex flex-col">{children}</div>
		</aside>
	);
}
