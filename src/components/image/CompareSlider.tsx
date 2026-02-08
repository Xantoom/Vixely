import { MoveHorizontal } from 'lucide-react';
import { useCallback, useRef, type RefObject } from 'react';
import { useImageEditorStore } from '@/stores/imageEditor.ts';

interface CompareSliderProps {
	containerRef: RefObject<HTMLDivElement | null>;
}

export function CompareSlider({ containerRef }: CompareSliderProps) {
	const { comparePosition, setComparePosition, view, originalData } = useImageEditorStore();
	const draggingRef = useRef(false);

	const imgW = originalData?.width ?? 0;
	const imgH = originalData?.height ?? 0;

	// Image bounds in screen space (relative to container)
	const imgLeft = view.panX;
	const imgTop = view.panY;
	const imgScreenW = imgW * view.zoom;
	const imgScreenH = imgH * view.zoom;

	const computeRatio = useCallback(
		(clientX: number) => {
			const el = containerRef.current;
			if (!el) return comparePosition;
			const rect = el.getBoundingClientRect();
			const x = clientX - rect.left;
			// Compute ratio relative to image bounds
			const ratio = (x - imgLeft) / imgScreenW;
			return Math.min(0.98, Math.max(0.02, ratio));
		},
		[containerRef, comparePosition, imgLeft, imgScreenW],
	);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
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

	// Position the slider line within image bounds
	const lineX = imgLeft + comparePosition * imgScreenW;

	return (
		<div className="absolute inset-0 z-20 pointer-events-none" style={{ touchAction: 'none' }}>
			{/* Labels (positioned within image bounds) */}
			<div
				className="absolute rounded-md bg-bg/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm text-text-secondary pointer-events-none"
				style={{ left: imgLeft + 8, top: imgTop + 8 }}
			>
				Before
			</div>
			<div
				className="absolute rounded-md bg-bg/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm text-text-secondary pointer-events-none"
				style={{ left: imgLeft + imgScreenW - 52, top: imgTop + 8 }}
			>
				After
			</div>

			{/* Vertical line (constrained to image height) */}
			<div
				className="absolute w-0.5 bg-white/80 pointer-events-none"
				style={{
					left: lineX,
					top: imgTop,
					height: imgScreenH,
					transform: 'translateX(-50%)',
					boxShadow: '0 0 4px rgba(0,0,0,0.5)',
				}}
			/>

			{/* Drag handle (hit area) */}
			<div
				className="absolute pointer-events-auto"
				style={{
					left: lineX,
					top: imgTop + imgScreenH / 2,
					transform: 'translate(-50%, -50%)',
					cursor: 'ew-resize',
					padding: '8px',
				}}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
			>
				{/* Visual handle */}
				<div className="w-6 h-8 rounded-full bg-white flex items-center justify-center shadow-lg border border-white/20">
					<MoveHorizontal size={14} className="text-neutral-600" />
				</div>
			</div>
		</div>
	);
}
