import { type PointerEvent as ReactPointerEvent, useRef } from 'react';
import type { Range } from '@/document/timemap';
import { formatClock } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { isVisible, rangeBox } from '../timeline-view';
import { type OverlayEditing, placeOverlay, useOverlaySelection } from './editing';
import type { Overlay } from './model';

/** Shortest time a layer shows for, in seconds. */
const MIN_SPAN = 0.1;
/** Width of the grip at each end of a bar, in CSS pixels. */
const GRIP = 7;

type Grab = { id: string; part: 'start' | 'end' | 'move'; x: number; span: Range; moved: boolean };

function label(overlay: Overlay): string {
	if (overlay.kind === 'text') return overlay.text.split('\n')[0] || m.layers_add_text();
	if (overlay.kind === 'shape') return m.layers_add_shape();
	if (overlay.kind === 'zone') return overlay.effect === 'blur' ? m.layers_zone_blur() : m.layers_zone_pixelate();
	if (overlay.kind === 'drawing') return m.layers_drawing();
	return m.layers_add_sticker();
}

/**
 * The layers along time, one row each, the front one on top, as in a video editor's timeline:
 * pressing a bar selects its layer, dragging it moves when it shows, dragging an end moves that
 * end. A layer shown all along fills its row.
 */
export function LayerLanes({
	editing,
	view,
	onSelect,
}: {
	editing: OverlayEditing;
	view: Range;
	/** A layer was pressed: its settings are shown. */
	onSelect: () => void;
}) {
	const selected = useOverlaySelection((state) => state.selected);
	const select = useOverlaySelection((state) => state.select);
	const grab = useRef<Grab | null>(null);
	const timing = editing.timing;
	if (!timing || editing.overlays.length === 0) return null;
	const { duration } = timing;
	const span = view.end - view.start;

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, overlay: Overlay) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		const bar = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - bar.left;
		const part = x < GRIP ? 'start' : x > bar.width - GRIP ? 'end' : 'move';
		event.currentTarget.setPointerCapture(event.pointerId);
		grab.current = {
			id: overlay.id,
			part,
			x: event.clientX,
			span: overlay.span ?? { start: 0, end: duration },
			moved: false,
		};
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const current = grab.current;
		const row = event.currentTarget.parentElement;
		if (!current || !row) return;
		if (!current.moved && Math.abs(event.clientX - current.x) < 3) return;
		current.moved = true;
		const shift = ((event.clientX - current.x) / row.clientWidth) * span;
		const { start, end } = current.span;
		let next: Range;
		if (current.part === 'move') {
			const moved = Math.min(Math.max(start + shift, 0), duration - (end - start));
			next = { start: moved, end: moved + end - start };
		} else if (current.part === 'start') {
			next = { start: Math.min(Math.max(0, start + shift), end - MIN_SPAN), end };
		} else {
			next = { start, end: Math.max(Math.min(duration, end + shift), start + MIN_SPAN) };
		}
		editing.preview(placeOverlay(current.id, { span: next }));
	};
	const onPointerUp = () => {
		const current = grab.current;
		grab.current = null;
		if (!current) return;
		if (current.moved) editing.settle();
		else {
			select(current.id);
			onSelect();
		}
	};

	return (
		<div role="group" aria-label={m.layers_list()} className="grid max-h-[7.5rem] gap-0.5 overflow-y-auto">
			{editing.overlays.toReversed().map((overlay) => {
				const shown = overlay.span ?? { start: 0, end: duration };
				const active = overlay.id === selected;
				return (
					<div key={overlay.id} className="bg-surface relative h-6 rounded-xs">
						{isVisible(shown, view) && (
							<div
								role="button"
								tabIndex={-1}
								aria-pressed={active}
								aria-label={`${label(overlay)}, ${formatClock(shown.start)}–${formatClock(shown.end)}`}
								title={`${label(overlay)} · ${overlay.span ? `${formatClock(shown.start)}–${formatClock(shown.end)}` : m.layers_always()}`}
								onPointerDown={(event) => {
									onPointerDown(event, overlay);
								}}
								onPointerMove={onPointerMove}
								onPointerUp={onPointerUp}
								onPointerCancel={() => {
									grab.current = null;
								}}
								className={`group text-caption absolute inset-y-0.5 flex min-w-2 cursor-grab touch-none items-center overflow-hidden rounded-[4px] px-2 font-medium whitespace-nowrap transition-[background-color,box-shadow] select-none active:cursor-grabbing ${
									active
										? 'bg-ed text-ed-ink shadow-[0_0_0_1.5px_var(--ed)]'
										: 'bg-ed-soft text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ed)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--ed)_28%,var(--bg))]'
								}`}
								style={rangeBox(shown, view)}
							>
								<span
									className="absolute inset-y-0 left-0 w-[7px] cursor-ew-resize"
									aria-hidden="true"
								/>
								<span className="truncate">{label(overlay)}</span>
								<span
									className="absolute inset-y-0 right-0 w-[7px] cursor-ew-resize"
									aria-hidden="true"
								/>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
