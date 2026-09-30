import { Scan } from 'lucide-react';
import { m } from '@/paraglide/messages.js';

/**
 * Back to the default zoom of a timeline, usable once it is zoomed: zooming itself is the
 * wheel's and the keyboard's.
 */
export function FitButton({
	zoomed,
	onFit,
	label = m.timeline_default_zoom(),
}: {
	zoomed: boolean;
	onFit: () => void;
	label?: string;
}) {
	return (
		<button
			type="button"
			title={m.zoom_hint()}
			disabled={!zoomed}
			onClick={onFit}
			className="text-small text-ink-2 enabled:hover:bg-surface enabled:hover:text-ink disabled:text-muted flex h-8 flex-none items-center gap-1.5 rounded-sm px-2.5 font-medium whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-50"
		>
			<Scan className="size-4" aria-hidden="true" />
			{label}
		</button>
	);
}
