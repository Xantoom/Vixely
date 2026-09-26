import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { formatPreciseTime } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
import { gridLines } from './document';
import { FAST_READING, readingSpeed } from './EditBox';
import { cueLabel } from './labels';
import { useOrigin } from './project';
import { useSubtitleDoc, useSubtitleEditor } from './store';

const ROW = 28;
/** Rows drawn above and below the visible ones, so fast scrolling doesn't show gaps. */
const OVERSCAN = 8;

/** Index of the line on screen at the playhead, so the grid marks it without redrawing on every frame. */
function useLineAtPlayhead(starts: readonly { start: number; end: number }[]): number {
	return usePlayback((state) => {
		const time = state.time * 1000;
		return starts.findIndex((cue) => cue.start <= time && time < cue.end);
	});
}

/**
 * Every line, one per row, as in Aegisub's subtitle grid: number, times, reading speed, style and
 * text. Click selects (Ctrl adds, Shift extends) and moves the video to the line; the arrow keys
 * go from line to line. Only the rows in view are drawn, so files of thousands of lines scroll
 * smoothly.
 */
export function LineGrid() {
	const doc = useSubtitleDoc();
	const selection = useSubtitleEditor((state) => state.selection);
	const active = useSubtitleEditor((state) => state.active);
	const select = useSubtitleEditor((state) => state.select);
	const lines = useMemo(() => gridLines(doc), [doc]);
	// A translation shows the original line beside the one typed.
	const origin = useOrigin();
	const current = useLineAtPlayhead(lines);
	const scrollRef = useRef<HTMLDivElement>(null);
	const { width, height } = useBoxSize(scrollRef);
	const [scrollTop, setScrollTop] = useState(0);
	const anchorRef = useRef<number | null>(null);
	// Narrow screens keep the number, the times and the text.
	const narrow = width > 0 && width < 560;
	const ass = doc.format === 'ass' && !narrow;
	const pictures = doc.format === 'pgs';
	const speedShown = !pictures && !narrow;
	const originShown = origin !== null;
	const text = originShown ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)';
	const columns = narrow
		? `40px 84px 84px ${text}`
		: `52px 96px 96px ${speedShown ? '64px ' : ''}${ass ? 'minmax(64px,120px) ' : ''}${text}`;

	const activeIndex = lines.findIndex((line) => line.id === active);

	// The line picked elsewhere (audio box, Enter in the edit box) scrolls into view.
	useEffect(() => {
		const box = scrollRef.current;
		if (!box || activeIndex < 0) return;
		const top = activeIndex * ROW;
		const header = ROW;
		if (top < box.scrollTop) box.scrollTop = top;
		else if (top + ROW > box.scrollTop + box.clientHeight - header)
			box.scrollTop = top + 2 * ROW - box.clientHeight;
	}, [activeIndex]);

	const pick = (index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
		const line = lines[index];
		if (!line) return;
		if (event.shiftKey && anchorRef.current !== null) {
			const from = Math.min(anchorRef.current, index);
			const to = Math.max(anchorRef.current, index);
			select(
				lines.slice(from, to + 1).map((cue) => cue.id),
				line.id,
			);
			return;
		}
		anchorRef.current = index;
		if (event.ctrlKey || event.metaKey) {
			const next = new Set(selection);
			if (next.has(line.id)) next.delete(line.id);
			else next.add(line.id);
			select(next, next.has(line.id) ? line.id : ([...next].at(-1) ?? null));
			return;
		}
		select([line.id]);
		// As in Aegisub, the video goes to the line picked, unless it is playing.
		if (!usePlayback.getState().playing) usePlayback.getState().seek(line.start / 1000);
	};

	const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		const moves: Record<string, number> = {
			ArrowDown: 1,
			ArrowUp: -1,
			PageDown: Math.max(1, Math.floor(height / ROW) - 2),
			PageUp: -Math.max(1, Math.floor(height / ROW) - 2),
		};
		let target: number | null = null;
		if (event.key in moves)
			target = Math.max(0, Math.min(lines.length - 1, Math.max(activeIndex, 0) + (moves[event.key] ?? 0)));
		else if (event.key === 'Home') target = 0;
		else if (event.key === 'End') target = lines.length - 1;
		if (target === null) return;
		event.preventDefault();
		pick(target, { shiftKey: event.shiftKey, ctrlKey: false, metaKey: false });
	};

	const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
	const last = Math.min(lines.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);
	const header = [
		'#',
		m.trim_start(),
		m.trim_end(),
		...(speedShown ? [m.subs_cps_short()] : []),
		...(ass ? [m.subs_style()] : []),
		...(originShown ? [m.subs_original()] : []),
		pictures ? m.subs_picture() : originShown ? m.subs_translation() : m.subs_text(),
	];

	return (
		<div
			ref={scrollRef}
			role="grid"
			aria-label={m.subs_lines()}
			aria-rowcount={lines.length + 1}
			tabIndex={0}
			onKeyDown={onKeyDown}
			onScroll={(event) => {
				setScrollTop(event.currentTarget.scrollTop);
			}}
			className="bg-bg focus-visible:outline-ed relative h-full min-h-0 overflow-auto rounded-xs shadow-[inset_0_0_0_1px_var(--line)] outline-offset-[-2px]"
		>
			<div
				role="row"
				className="bg-surface border-line text-caption text-muted sticky top-0 z-10 grid border-b font-medium"
				style={{ gridTemplateColumns: columns, height: ROW }}
			>
				{header.map((label) => (
					<span key={label} role="columnheader" className="flex items-center truncate px-2">
						{label}
					</span>
				))}
			</div>
			<div className="relative" style={{ height: lines.length * ROW }}>
				{lines.slice(first, last).map((line, offset) => {
					const index = first + offset;
					const selected = selection.has(line.id);
					const speed = speedShown ? readingSpeed(line, doc.format) : 0;
					return (
						<div
							key={line.id}
							role="row"
							aria-selected={selected}
							aria-rowindex={index + 2}
							onPointerDown={(event) => {
								if (event.button === 0) pick(index, event);
							}}
							className={`border-line/60 absolute inset-x-0 grid cursor-pointer border-b text-[12.5px] ${
								line.id === active ? 'bg-ed/25' : selected ? 'bg-ed-soft' : 'hover:bg-surface'
							}`}
							style={{ top: index * ROW, height: ROW, gridTemplateColumns: columns }}
						>
							<span
								role="gridcell"
								className={`text-muted tabular flex items-center px-2 font-mono ${
									index === current ? 'shadow-[inset_3px_0_0_var(--ed)]' : ''
								}`}
							>
								{index + 1}
							</span>
							<span role="gridcell" className="tabular flex items-center px-2 font-mono">
								{formatPreciseTime(line.start / 1000)}
							</span>
							<span role="gridcell" className="tabular flex items-center px-2 font-mono">
								{formatPreciseTime(line.end / 1000)}
							</span>
							{speedShown && (
								<span
									role="gridcell"
									className={`tabular flex items-center px-2 font-mono ${
										speed > FAST_READING ? 'text-danger font-semibold' : 'text-muted'
									}`}
								>
									{Math.round(speed)}
								</span>
							)}
							{ass && (
								<span role="gridcell" className="text-muted flex items-center truncate px-2">
									{line.fields?.style ?? ''}
								</span>
							)}
							{originShown && (
								<span role="gridcell" className="text-muted flex min-w-0 items-center px-2">
									<span className="truncate">
										{(origin.get(line.id) ?? '').replace(/\n/g, ' \u23CE ')}
									</span>
								</span>
							)}
							<span role="gridcell" className="flex min-w-0 items-center px-2">
								<span className="truncate">
									{cueLabel(line, doc.format).replace(/\n/g, ' \u23CE ')}
								</span>
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
