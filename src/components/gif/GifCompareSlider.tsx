import { MoveHorizontal } from 'lucide-react';
import { useCallback, useRef } from 'react';

interface GifCompareSliderProps {
	comparePosition: number;
	setComparePosition: (position: number) => void;
}

export function GifCompareSlider({ comparePosition, setComparePosition }: GifCompareSliderProps) {
	const draggingRef = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const computeRatio = useCallback(
		(clientX: number) => {
			const el = containerRef.current;
			if (!el) return comparePosition;
			const rect = el.getBoundingClientRect();
			const ratio = (clientX - rect.left) / rect.width;
			return Math.min(1, Math.max(0, ratio));
		},
		[comparePosition],
	);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();
			e.currentTarget.setPointerCapture(e.pointerId);
			draggingRef.current = true;
			setComparePosition(computeRatio(e.clientX));
		},
		[computeRatio, setComparePosition],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!draggingRef.current) return;
			setComparePosition(computeRatio(e.clientX));
		},
		[computeRatio, setComparePosition],
	);

	const onPointerUp = useCallback(() => {
		draggingRef.current = false;
	}, []);

	const pct = `${(comparePosition * 100).toFixed(2)}%`;

	return (
		<div ref={containerRef} className="absolute inset-0 z-20 pointer-events-none" style={{ touchAction: 'none' }}>
			{/* Labels */}
			<div className="absolute left-2 top-2 rounded-md bg-bg/70 px-2 py-0.5 text-[14px] font-medium backdrop-blur-sm text-text-secondary pointer-events-none">
				Before
			</div>
			<div className="absolute right-2 top-2 rounded-md bg-bg/70 px-2 py-0.5 text-[14px] font-medium backdrop-blur-sm text-text-secondary pointer-events-none">
				After
			</div>

			{/* Vertical divider line */}
			<div
				className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
				style={{ left: pct, transform: 'translateX(-50%)', boxShadow: '0 0 4px rgba(0,0,0,0.5)' }}
			/>

			{/* Drag handle */}
			<div
				className="absolute pointer-events-auto"
				style={{
					left: pct,
					top: '50%',
					transform: 'translate(-50%, -50%)',
					cursor: 'ew-resize',
					padding: '8px',
				}}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
			>
				<div className="w-6 h-8 rounded-full bg-white flex items-center justify-center shadow-lg border border-white/20">
					<MoveHorizontal size={14} className="text-neutral-600" />
				</div>
			</div>
		</div>
	);
}
