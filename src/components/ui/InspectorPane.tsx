import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

interface InspectorPaneProps {
	width: number;
	minWidth?: number;
	maxWidth?: number;
	collapsed: boolean;
	onCollapsedChange: (next: boolean) => void;
	onWidthChange: (nextWidth: number) => void;
	children: ReactNode;
	ariaLabel: string;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function InspectorPane({
	width,
	minWidth = 280,
	maxWidth = 520,
	collapsed,
	onCollapsedChange,
	onWidthChange,
	children,
	ariaLabel,
}: InspectorPaneProps) {
	const resizingRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

	const stopResizing = useCallback(() => {
		resizingRef.current = null;
	}, []);

	useEffect(() => {
		const onPointerMove = (event: globalThis.PointerEvent) => {
			const state = resizingRef.current;
			if (!state) return;
			const deltaX = state.startX - event.clientX;
			const next = clamp(state.startWidth + deltaX, minWidth, maxWidth);
			onWidthChange(next);
		};

		const onPointerUp = (event: globalThis.PointerEvent) => {
			const state = resizingRef.current;
			if (!state) return;
			if (event.pointerId !== state.pointerId) return;
			stopResizing();
		};

		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerUp);
		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerUp);
		};
	}, [maxWidth, minWidth, onWidthChange, stopResizing]);

	const startResizing = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			if (collapsed) return;
			resizingRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
			event.currentTarget.setPointerCapture(event.pointerId);
		},
		[collapsed, width],
	);

	if (collapsed) {
		return (
			<aside className="hidden md:flex w-12 shrink-0 border-l border-border bg-surface items-start justify-center pt-3">
				<button
					onClick={() => {
						onCollapsedChange(false);
					}}
					aria-label={`Expand ${ariaLabel}`}
					title={`Expand ${ariaLabel}`}
					className="h-8 w-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				>
					<ChevronLeft size={16} />
				</button>
			</aside>
		);
	}

	return (
		<aside
			className="hidden md:flex shrink-0 overflow-hidden border-l border-border bg-surface flex-col relative"
			style={{ width: `${width}px` }}
		>
			<div
				className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-accent/20 transition-colors"
				onPointerDown={startResizing}
				role="separator"
				aria-orientation="vertical"
				aria-label={`${ariaLabel} resize handle`}
			/>
			<button
				onClick={() => {
					onCollapsedChange(true);
				}}
				aria-label={`Collapse ${ariaLabel}`}
				title={`Collapse ${ariaLabel}`}
				className="absolute top-2 left-2 z-10 h-7 w-7 flex items-center justify-center rounded-md border border-border/70 bg-bg/40 text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
			>
				<ChevronRight size={14} />
			</button>
			<div className="h-full min-w-0 overflow-hidden flex flex-col">{children}</div>
		</aside>
	);
}
