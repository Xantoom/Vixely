import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "~/ui/cn.ts";

export type CompareSliderProps = {
	/** The edited render. Occupies the full frame. */
	edited: ReactNode;
	/** The same graph with the colour pass neutralised — never a raw source. */
	neutral: ReactNode;
	label: string;
	className?: string;
};

/**
 * Splits two renders of the *same* pipeline.
 *
 * Comparing against the untouched source file would compare two different
 * pipelines and quietly hide a discrepancy; the neutral side is the graph run
 * with neutral uniforms, which is the only honest comparison.
 */
export function CompareSlider({ edited, neutral, label, className }: CompareSliderProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState(50);
	const [dragging, setDragging] = useState(false);

	const moveTo = useCallback((clientX: number) => {
		const bounds = containerRef.current?.getBoundingClientRect();
		if (bounds === undefined) return;
		const ratio = ((clientX - bounds.left) / bounds.width) * 100;
		setPosition(Math.min(100, Math.max(0, ratio)));
	}, []);

	return (
		<div ref={containerRef} className={cn("relative size-full", className)}>
			{neutral}
			<div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
				{edited}
			</div>

			<div
				role="slider"
				aria-label={label}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(position)}
				aria-valuetext={`${Math.round(position)}%`}
				tabIndex={0}
				onPointerDown={(event) => {
					setDragging(true);
					event.currentTarget.setPointerCapture(event.pointerId);
					moveTo(event.clientX);
				}}
				onPointerMove={(event) => {
					if (dragging) moveTo(event.clientX);
				}}
				onPointerUp={(event) => {
					setDragging(false);
					event.currentTarget.releasePointerCapture(event.pointerId);
				}}
				onKeyDown={(event) => {
					const step = event.shiftKey ? 10 : 2;
					if (event.key === "ArrowLeft") setPosition((p) => Math.max(0, p - step));
					else if (event.key === "ArrowRight") setPosition((p) => Math.min(100, p + step));
					else if (event.key === "Home") setPosition(0);
					else if (event.key === "End") setPosition(100);
					else return;
					event.preventDefault();
				}}
				className="absolute inset-y-0 z-10 w-11 -translate-x-1/2 cursor-ew-resize outline-none"
				style={{ left: `${position}%` }}
			>
				<span
					aria-hidden
					className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--accent)] shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
				/>
				<span
					aria-hidden
					className="absolute top-1/2 left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--bg-raised)]"
				>
					<svg
						width="12"
						height="12"
						viewBox="0 0 16 16"
						className="fill-none stroke-[var(--accent)] stroke-[1.6]"
					>
						<path
							d="M6.5 4 3 8l3.5 4M9.5 4 13 8l-3.5 4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</span>
			</div>
		</div>
	);
}
