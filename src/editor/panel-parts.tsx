import { ChevronDown, RotateCcw } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import type { AspectId } from '@/editors/image/store';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';

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
		<IconButton label={m.reset()} disabled={disabled} onClick={onClick}>
			<RotateCcw className="size-[1.15rem]" />
		</IconButton>
	);
}

/**
 * A group of settings on a card, folded by its title. A dot tells it differs from the start, and
 * its own button resets it.
 */
export function Group({
	title,
	changed = false,
	onReset,
	children,
}: {
	title: string;
	changed?: boolean;
	onReset?: () => void;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	const bodyId = useId();
	const toggle = () => {
		setOpen((value) => !value);
	};
	return (
		<section className="bg-surface rounded-md">
			<div className="flex items-center gap-0.5 py-1.5 pr-2 pl-4">
				<button
					type="button"
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={toggle}
					className="text-body flex flex-1 items-center gap-2 py-1.5 text-left font-semibold"
				>
					<span
						aria-hidden="true"
						className={`bg-ed ease-spring size-[0.45rem] rounded-full transition-transform duration-300 ${changed ? 'scale-100' : 'scale-0'}`}
					/>
					{title}
				</button>
				{onReset && <ResetButton disabled={!changed} onClick={onReset} />}
				<IconButton label={title} aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
					<ChevronDown
						className={`ease-out-soft size-[1.15rem] transition-transform duration-300 ${open ? '' : '-rotate-90'}`}
					/>
				</IconButton>
			</div>
			<div
				id={bodyId}
				className={`ease-out-soft grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
			>
				<div className="overflow-hidden">
					<div className="grid gap-4 px-4 pt-1 pb-4.5">{children}</div>
				</div>
			</div>
		</section>
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
