import { formatPercent } from '@/lib/format';
import { m } from '@/paraglide/messages.js';

const SMALLER = [25, 50, 75];

const CHIP =
	'text-ui tabular text-ink-2 hover:bg-surface aria-checked:bg-ed-soft aria-checked:text-ink h-9 rounded-sm font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)] disabled:opacity-40';

/**
 * Shares of the picture in one row: smaller ones, then the original. Enlarging adds no detail: a
 * larger size is typed, or taken from the common sizes, where it says so.
 */
export function ScaleChoices({
	scale,
	untouched,
	onScale,
	onOriginal,
}: {
	/** The share exported, in percent. */
	scale: number;
	/** Nothing chosen: the original size. */
	untouched: boolean;
	onScale: (percent: number) => void;
	onOriginal: () => void;
}) {
	const chip = (percent: number, label: string) => (
		<button
			key={percent}
			type="button"
			role="radio"
			aria-checked={!untouched && scale === percent}
			onClick={() => {
				onScale(percent);
			}}
			className={CHIP}
		>
			{label}
		</button>
	);
	return (
		<div role="radiogroup" aria-label={m.resize_scale()} className="grid grid-cols-4 gap-1.5">
			{SMALLER.map((percent) => chip(percent, formatPercent(percent)))}
			<button
				type="button"
				role="radio"
				aria-checked={untouched || scale === 100}
				onClick={onOriginal}
				className={CHIP}
			>
				{formatPercent(100)}
			</button>
		</div>
	);
}
