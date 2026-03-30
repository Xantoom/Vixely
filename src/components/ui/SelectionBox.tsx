/**
 * SelectionBox — shared selection rectangle for all editors.
 *
 * Design: utilitarian-precision (Figma/Photoshop-inspired).
 * - 1px white border with subtle outer shadow for contrast on any background
 * - L-shaped corner brackets (not squares)
 * - Thin edge midpoint bars
 * - Rule-of-thirds grid (subtle)
 * - Floating dimension badge above the box
 * - Scrim (darkened area outside selection) via box-shadow
 */

import { memo } from 'react';

/* ── Types ── */

export type SelectionHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export interface SelectionBoxProps {
	/** Left offset in CSS units (px or %) */
	left: number | string;
	/** Top offset in CSS units (px or %) */
	top: number | string;
	/** Width in CSS units (px or %) */
	width: number | string;
	/** Height in CSS units (px or %) */
	height: number | string;
	/** Display width (source pixels) */
	displayWidth: number;
	/** Display height (source pixels) */
	displayHeight: number;
	/** Show edge midpoint handles (false when aspect locked) */
	showEdgeHandles?: boolean;
	/** Show rule-of-thirds grid */
	showGrid?: boolean;
	/** Optional warning state — amber color for "at max" etc. */
	warning?: boolean;
	/** Called when a drag starts on a handle */
	onHandlePointerDown: (e: React.PointerEvent, handle: SelectionHandle) => void;
}

/* ── Corner bracket geometry ── */

const BRACKET_LEN = 10;
const BRACKET_W = 1.5;

const CORNERS: { id: SelectionHandle; x: 'left' | 'right'; y: 'top' | 'bottom'; cursor: string }[] = [
	{ id: 'nw', x: 'left', y: 'top', cursor: 'nwse-resize' },
	{ id: 'ne', x: 'right', y: 'top', cursor: 'nesw-resize' },
	{ id: 'sw', x: 'left', y: 'bottom', cursor: 'nesw-resize' },
	{ id: 'se', x: 'right', y: 'bottom', cursor: 'nwse-resize' },
];

const EDGES: { id: SelectionHandle; pos: string; size: string; barClass: string; cursor: string }[] = [
	{
		id: 'n',
		pos: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
		size: 'w-12 h-4',
		barClass: 'w-5 h-[2px] rounded-full',
		cursor: 'ns-resize',
	},
	{
		id: 's',
		pos: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
		size: 'w-12 h-4',
		barClass: 'w-5 h-[2px] rounded-full',
		cursor: 'ns-resize',
	},
	{
		id: 'w',
		pos: 'left-0 top-1/2 -translate-y-1/2 -translate-x-1/2',
		size: 'h-12 w-4',
		barClass: 'h-5 w-[2px] rounded-full',
		cursor: 'ew-resize',
	},
	{
		id: 'e',
		pos: 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
		size: 'h-12 w-4',
		barClass: 'h-5 w-[2px] rounded-full',
		cursor: 'ew-resize',
	},
];

/* ── Component ── */

export const SelectionBox = memo(function SelectionBox({
	left,
	top,
	width,
	height,
	displayWidth,
	displayHeight,
	showEdgeHandles = true,
	showGrid = true,
	warning = false,
	onHandlePointerDown,
}: SelectionBoxProps) {
	const borderColor = warning ? 'rgba(251,191,36,0.85)' : 'rgba(255,255,255,0.8)';
	const bracketColor = warning ? '#fbbf24' : '#ffffff';
	const badgeBg = warning ? 'bg-amber-500/15 text-amber-300' : 'bg-black/65 text-white/90';

	return (
		<div className="absolute" style={{ left, top, width, height, boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.50)' }}>
			{/* Border — thin with outer shadow for readability on any background */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{ border: `1px solid ${borderColor}`, boxShadow: `0 0 0 1px rgba(0,0,0,0.35)` }}
			/>

			{/* Rule of thirds grid */}
			{showGrid && (
				<div className="absolute inset-0 pointer-events-none">
					<div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/[0.12]" />
					<div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/[0.12]" />
					<div className="absolute top-1/3 left-0 right-0 h-px bg-white/[0.12]" />
					<div className="absolute top-2/3 left-0 right-0 h-px bg-white/[0.12]" />
				</div>
			)}

			{/* Move area — inset so it doesn't overlap corner/edge hit zones */}
			<div
				className="absolute inset-3 cursor-grab active:cursor-grabbing"
				onPointerDown={(e) => {
					onHandlePointerDown(e, 'move');
				}}
			/>

			{/* Dimension badge */}
			<div
				className={`absolute left-1/2 -translate-x-1/2 pointer-events-none rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums leading-none whitespace-nowrap backdrop-blur-sm ${badgeBg}`}
				style={{ bottom: 'calc(100% + 6px)' }}
			>
				{displayWidth}&times;{displayHeight}
			</div>

			{/* ── Corner brackets (L-shaped) ── */}
			{CORNERS.map((c) => {
				// Hit zone: 14x14 area at corner for easy grabbing
				const hitStyle: React.CSSProperties = { [c.y]: -4, [c.x]: -4, width: 14, height: 14, cursor: c.cursor };

				// Two bars forming an L
				const hBar: React.CSSProperties = {
					position: 'absolute',
					[c.y]: 3,
					[c.x]: 3,
					width: BRACKET_LEN,
					height: BRACKET_W,
					background: bracketColor,
					borderRadius: 1,
				};
				const vBar: React.CSSProperties = {
					position: 'absolute',
					[c.y]: 3,
					[c.x]: 3,
					width: BRACKET_W,
					height: BRACKET_LEN,
					background: bracketColor,
					borderRadius: 1,
				};

				return (
					<div
						key={c.id}
						className="absolute z-30"
						style={hitStyle}
						onPointerDown={(e) => {
							onHandlePointerDown(e, c.id);
						}}
					>
						<div className="pointer-events-none" style={hBar} />
						<div className="pointer-events-none" style={vBar} />
					</div>
				);
			})}

			{/* ── Edge midpoint handles ── */}
			{showEdgeHandles &&
				EDGES.map((edge) => (
					<div
						key={edge.id}
						className={`absolute z-30 flex items-center justify-center ${edge.pos} ${edge.size}`}
						style={{ cursor: edge.cursor }}
						onPointerDown={(e) => {
							onHandlePointerDown(e, edge.id);
						}}
					>
						<div
							className={`pointer-events-none ${edge.barClass}`}
							style={{ background: bracketColor, opacity: 0.7 }}
						/>
					</div>
				))}
		</div>
	);
});
