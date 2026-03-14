import { useEffect, useCallback, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';

interface BottomSheetProps {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
}

const DISMISS_THRESHOLD = 80;

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
	const sheetRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{ startY: number; currentY: number } | null>(null);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		},
		[onClose],
	);

	useEffect(() => {
		if (open) {
			document.addEventListener('keydown', handleKeyDown);
			return () => {
				document.removeEventListener('keydown', handleKeyDown);
			};
		}
	}, [open, handleKeyDown]);

	const handleDragStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
		dragRef.current = { startY: e.clientY, currentY: e.clientY };
		e.currentTarget.setPointerCapture(e.pointerId);
	}, []);

	const handleDragMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragRef.current) return;
		dragRef.current.currentY = e.clientY;
		const deltaY = Math.max(0, e.clientY - dragRef.current.startY);
		if (sheetRef.current) {
			sheetRef.current.style.transform = `translateY(${deltaY}px)`;
			sheetRef.current.style.transition = 'none';
		}
	}, []);

	const handleDragEnd = useCallback(() => {
		if (!dragRef.current || !sheetRef.current) {
			dragRef.current = null;
			return;
		}
		const deltaY = dragRef.current.currentY - dragRef.current.startY;
		dragRef.current = null;

		sheetRef.current.style.transition = '';
		if (deltaY > DISMISS_THRESHOLD) {
			sheetRef.current.style.transform = 'translateY(100%)';
			onClose();
		} else {
			sheetRef.current.style.transform = 'translateY(0)';
		}
	}, [onClose]);

	// Reset transform when opened
	useEffect(() => {
		if (open && sheetRef.current) {
			sheetRef.current.style.transform = '';
			sheetRef.current.style.transition = '';
		}
	}, [open]);

	return (
		<>
			{/* Backdrop */}
			<div
				className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
					open ? 'opacity-100' : 'opacity-0 pointer-events-none'
				}`}
				onClick={onClose}
			/>

			{/* Sheet */}
			<div
				ref={sheetRef}
				className={`fixed inset-x-0 bottom-0 z-50 flex flex-col bg-surface rounded-t-2xl border-t border-border shadow-2xl transition-transform duration-300 ease-out ${
					open ? 'animate-slide-up-sheet' : 'translate-y-full'
				}`}
				style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
			>
				{/* Drag handle */}
				<div
					className="flex items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none shrink-0"
					onPointerDown={handleDragStart}
					onPointerMove={handleDragMove}
					onPointerUp={handleDragEnd}
					onPointerCancel={handleDragEnd}
				>
					<div className="h-1 w-8 rounded-full bg-text-tertiary/40" />
				</div>

				{/* Content */}
				<div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
			</div>
		</>
	);
}
