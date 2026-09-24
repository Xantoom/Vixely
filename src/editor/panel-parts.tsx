import type { ReactNode } from 'react';
import type { AspectId } from '@/editors/image/store';
import { m } from '@/paraglide/messages.js';

/** Pieces shared by the inspector panels of every editor. */

export function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-3">
			<h3 className="text-ui text-ink-2 font-semibold">{title}</h3>
			{children}
		</section>
	);
}

export function ResetButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className="text-ui text-muted enabled:hover:text-ink font-medium transition-colors disabled:opacity-40"
		>
			{m.reset()}
		</button>
	);
}

/** Square button with an icon and a short caption; `label` is the full name for assistive tech. */
export function ToolButton({
	label,
	caption,
	icon,
	onClick,
}: {
	label: string;
	caption: string;
	icon: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className="text-caption text-ink-2 hover:bg-surface hover:text-ink grid justify-items-center gap-1.5 rounded-sm px-1 pt-2.5 pb-2 font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors"
		>
			{icon}
			<span aria-hidden="true">{caption}</span>
		</button>
	);
}

export const ASPECT_LABELS: Record<AspectId, () => string> = {
	'free': () => m.aspect_free(),
	'original': () => m.aspect_original(),
	'1:1': () => '1:1',
	'4:5': () => '4:5',
	'5:4': () => '5:4',
	'3:2': () => '3:2',
	'2:3': () => '2:3',
	'16:9': () => '16:9',
	'9:16': () => '9:16',
};
