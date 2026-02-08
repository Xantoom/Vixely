import { useEffect, useCallback, type ReactNode } from 'react';

interface DrawerProps {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	side?: 'right' | 'left';
}

export function Drawer({ open, onClose, children, side = 'right' }: DrawerProps) {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		},
		[onClose],
	);

	useEffect(() => {
		if (open) {
			document.addEventListener('keydown', handleKeyDown);
			return () => document.removeEventListener('keydown', handleKeyDown);
		}
	}, [open, handleKeyDown]);

	return (
		<>
			{/* Backdrop */}
			<div
				className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 md:hidden ${
					open ? 'opacity-100' : 'opacity-0 pointer-events-none'
				}`}
				onClick={onClose}
			/>

			{/* Drawer panel */}
			<div
				className={`fixed top-0 ${side === 'right' ? 'right-0' : 'left-0'} z-50 h-full w-[85vw] max-w-72 bg-surface border-${side === 'right' ? 'l' : 'r'} border-border shadow-2xl transition-transform duration-200 ease-out md:hidden ${
					open ? 'translate-x-0' : side === 'right' ? 'translate-x-full' : '-translate-x-full'
				}`}
			>
				{children}
			</div>
		</>
	);
}
