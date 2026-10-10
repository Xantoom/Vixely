import type { ReactNode } from 'react';

/** A fact of a list: the name quiet and smaller, the value in full ink, told apart at a glance. */
export function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
			<dt className="text-small text-muted whitespace-nowrap">{label}</dt>
			<dd className="text-ui text-ink tabular text-right font-medium text-balance">{value}</dd>
		</div>
	);
}

/** Free text such as a title: proportional font, allowed to wrap. */
export function TextRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-3">
			<dt className="text-small text-muted">{label}</dt>
			<dd className="text-ui text-ink text-right font-medium break-words">{value}</dd>
		</div>
	);
}

/** A few facts under a heading of their own, set off from the others by a line. */
export function Facts({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
	return (
		<section className="border-line grid gap-2.5 border-t pt-4">
			{title && (
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-ui font-semibold">{title}</h3>
					{aside}
				</div>
			)}
			<dl className="grid gap-2">{children}</dl>
		</section>
	);
}
