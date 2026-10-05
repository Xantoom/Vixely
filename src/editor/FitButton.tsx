import { Scan } from 'lucide-react';
import { m } from '@/paraglide/messages.js';

/**
 * Back to the default zoom of a timeline, shown only once it is zoomed: zooming itself is the
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
	if (!zoomed) return null;
	return (
		<button
			type="button"
			aria-label={label}
			data-tip={label}
			onClick={onFit}
			className="text-ink-2 hover:bg-surface hover:text-ink -mr-1.5 grid size-8 flex-none place-items-center rounded-sm transition-colors"
		>
			<Scan className="size-4" aria-hidden="true" />
		</button>
	);
}
