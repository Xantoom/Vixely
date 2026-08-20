import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import type { GifFrame } from "~/core/document";
import { cn } from "~/ui/cn.ts";

export type FrameStripProps = {
	frames: readonly GifFrame[];
	/** Thumbnails by frame id; missing ones render as a placeholder. */
	thumbnails: ReadonlyMap<string, ImageBitmap>;
	selectedIds: ReadonlySet<string>;
	currentIndex: number;
	onSelect: (id: string, additive: boolean) => void;
	onMove: (from: number, to: number) => void;
	label: string;
	className?: string;
};

const FRAME_WIDTH = 84;

/**
 * The GIF timeline.
 *
 * Virtualised because a 500-frame file must not put 500 canvases in the DOM —
 * that alone is the difference between an editor that opens instantly and one
 * that locks the tab for several seconds.
 */
export function FrameStrip({
	frames,
	thumbnails,
	selectedIds,
	currentIndex,
	onSelect,
	onMove,
	label,
	className,
}: FrameStripProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const dragFrom = useRef<number | null>(null);

	const virtualizer = useVirtualizer({
		count: frames.length,
		horizontal: true,
		getScrollElement: () => containerRef.current,
		estimateSize: () => FRAME_WIDTH,
		overscan: 6,
	});

	// Keeps the playhead in view while the animation runs.
	useEffect(() => {
		if (currentIndex >= 0 && currentIndex < frames.length) {
			virtualizer.scrollToIndex(currentIndex, { align: "auto" });
		}
	}, [currentIndex, frames.length, virtualizer]);

	return (
		<div
			ref={containerRef}
			role="listbox"
			aria-label={label}
			aria-multiselectable
			aria-orientation="horizontal"
			className={cn("h-24 overflow-x-auto overflow-y-hidden", className)}
		>
			<div style={{ width: virtualizer.getTotalSize(), position: "relative", height: "100%" }}>
				{virtualizer.getVirtualItems().map((item) => {
					const frame = frames[item.index];
					if (frame === undefined) return null;
					const selected = selectedIds.has(frame.id);

					return (
						<div
							key={frame.id}
							role="option"
							aria-selected={selected}
							aria-label={`${item.index + 1} · ${frame.delayMs} ms`}
							tabIndex={item.index === currentIndex ? 0 : -1}
							draggable
							onDragStart={() => {
								dragFrom.current = item.index;
							}}
							onDragOver={(event) => event.preventDefault()}
							onDrop={() => {
								if (dragFrom.current !== null) onMove(dragFrom.current, item.index);
								dragFrom.current = null;
							}}
							onClick={(event) => onSelect(frame.id, event.shiftKey || event.metaKey)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onSelect(frame.id, event.shiftKey);
								}
							}}
							style={{
								position: "absolute",
								left: item.start,
								width: item.size,
								height: "100%",
							}}
							className={cn(
								"flex cursor-pointer flex-col items-center gap-1 p-1 outline-none",
								"focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
							)}
						>
							<Thumbnail
								bitmap={thumbnails.get(frame.id)}
								selected={selected}
								current={item.index === currentIndex}
							/>
							<span className="tabular text-2xs text-[var(--text-subtle)]">
								{item.index + 1} · {frame.delayMs}ms
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function Thumbnail({
	bitmap,
	selected,
	current,
}: {
	bitmap: ImageBitmap | undefined;
	selected: boolean;
	current: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null || bitmap === undefined) return;
		const context = canvas.getContext("2d");
		if (context === null) return;
		context.clearRect(0, 0, canvas.width, canvas.height);
		// Fit inside the tile, preserving the aspect ratio.
		const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
		const width = bitmap.width * scale;
		const height = bitmap.height * scale;
		context.drawImage(
			bitmap,
			(canvas.width - width) / 2,
			(canvas.height - height) / 2,
			width,
			height,
		);
	}, [bitmap]);

	return (
		<canvas
			ref={canvasRef}
			width={72}
			height={54}
			className={cn(
				"rounded-[var(--radius-control)] border-2 bg-[var(--bg-deep)]",
				current
					? "border-[var(--accent)]"
					: selected
						? "border-[var(--accent-surface)]"
						: "border-transparent",
			)}
		/>
	);
}
