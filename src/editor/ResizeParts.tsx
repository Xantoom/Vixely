import type { Size } from '@/editors/image/document';
import { m } from '@/paraglide/messages.js';

const SMALLER = [25, 50, 75];
const LARGER = [150, 200, 300, 400];

const CHIP =
	'text-ui tabular text-ink-2 hover:bg-surface aria-checked:bg-ed-soft aria-checked:text-ink h-9 rounded-sm font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)] disabled:opacity-40';

/**
 * Shares of the picture in two rows: smaller ones and the original, then larger ones. A share
 * that would pass `largest` pixels on a side is off.
 */
export function ScaleChoices({
	from,
	scale,
	untouched,
	largest,
	onScale,
	onOriginal,
}: {
	from: Size;
	/** The share exported, in percent. */
	scale: number;
	/** Nothing chosen: the original size. */
	untouched: boolean;
	largest: number;
	onScale: (percent: number) => void;
	onOriginal: () => void;
}) {
	const side = Math.max(from.width, from.height);
	const chip = (percent: number, label: string) => (
		<button
			key={percent}
			type="button"
			role="radio"
			disabled={(side * percent) / 100 > largest}
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
			{SMALLER.map((percent) => chip(percent, `${percent} %`))}
			<button
				type="button"
				role="radio"
				aria-checked={untouched || scale === 100}
				onClick={onOriginal}
				className={CHIP}
			>
				100 %
			</button>
			{LARGER.map((percent) => chip(percent, `×${percent / 100}`))}
		</div>
	);
}
