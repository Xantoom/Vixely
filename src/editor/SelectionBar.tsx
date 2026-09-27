import { Crop, Scissors, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cut, type Kept, keepOnly } from '@/document/kept';
import type { Range } from '@/document/timemap';
import { formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';

function BarButton({
	label,
	shortcut,
	onClick,
	children,
}: {
	label: string;
	shortcut?: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			title={shortcut ? `${label} (${shortcut})` : label}
			onClick={onClick}
			className="text-ui hover:bg-surface-2 flex h-8 items-center gap-1.5 rounded-xs px-2.5 font-medium transition-colors"
		>
			{children}
			{label}
		</button>
	);
}

/**
 * What can be done with a passage selected on a timeline, floating above it: remove it, keep only
 * it, or let it go. Sits over the selection's middle, and stays inside the timeline at its ends.
 */
export function SelectionBar<T extends Kept>({
	selection,
	view,
	apply,
	onClear,
}: {
	selection: Range;
	/** The part of the timeline shown. */
	view: Range;
	apply: (change: (doc: T) => T) => void;
	onClear: () => void;
}) {
	const span = view.end - view.start;
	const middle = Math.min(1, Math.max(0, ((selection.start + selection.end) / 2 - view.start) / span));
	return (
		<div
			role="toolbar"
			aria-label={m.selection_title()}
			onPointerDown={(event) => {
				event.stopPropagation();
			}}
			className="menu-in bg-bg absolute -top-11 z-20 flex items-center gap-0.5 rounded-sm p-1 whitespace-nowrap shadow-[0_0_0_1px_var(--line-2),0_10px_28px_-10px_rgb(0_0_0/0.35)]"
			style={{ left: `${middle * 100}%`, transform: `translateX(-${middle * 100}%)` }}
		>
			<span className="text-caption text-muted tabular px-2 font-mono">
				{formatPreciseTime(selection.end - selection.start)}
			</span>
			<BarButton
				label={m.selection_delete()}
				shortcut={m.key_delete()}
				onClick={() => {
					apply((current) => cut(current, selection));
					onClear();
				}}
			>
				<Scissors size={15} aria-hidden="true" />
			</BarButton>
			<BarButton
				label={m.selection_keep()}
				onClick={() => {
					apply((current) => keepOnly(current, selection));
					onClear();
				}}
			>
				<Crop size={15} aria-hidden="true" />
			</BarButton>
			<button
				type="button"
				aria-label={m.selection_clear()}
				title={`${m.selection_clear()} (Esc)`}
				onClick={onClear}
				className="text-muted hover:bg-surface-2 hover:text-ink grid size-8 place-items-center rounded-xs transition-colors"
			>
				<X size={15} aria-hidden="true" />
			</button>
		</div>
	);
}
