import { ChevronDown, RotateCcw } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import type { FixedAspect } from '@/editors/image/store';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';

/** Pieces shared by the inspector panels of every editor. */

/**
 * A part of a panel under its title. At the top level of a panel, a line across the whole panel
 * sets it off from the parts around it (the panel's own styles), so each can be found at a glance.
 */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
	return (
		<section className="border-line grid gap-3.5 border-t pt-4">
			<div className="-my-1 flex min-h-8 items-center gap-2">
				<h3 className="text-ui text-ink flex-1 font-semibold tracking-[-0.005em]">{title}</h3>
				{action}
			</div>
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
 * A group of settings under a line, folded by its title. A dot tells it differs from the start,
 * and its own button resets it.
 */
export function Group({
	title,
	changed = false,
	onReset,
	defaultOpen = true,
	children,
}: {
	title: string;
	changed?: boolean;
	onReset?: () => void;
	/** Settings seldom changed start folded. */
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const bodyId = useId();
	const toggle = () => {
		setOpen((value) => !value);
	};
	return (
		<section className="border-line border-t pt-2">
			<div className="-mr-2 flex items-center gap-0.5">
				<button
					type="button"
					aria-expanded={open}
					aria-controls={bodyId}
					onClick={toggle}
					className="text-ui text-ink flex flex-1 items-center gap-2 py-1.5 text-left font-semibold tracking-[-0.005em]"
				>
					{title}
					<span
						aria-hidden="true"
						className={`bg-ed ease-spring size-[0.45rem] rounded-full transition-transform duration-300 ${changed ? 'scale-100' : 'scale-0'}`}
					/>
				</button>
				{onReset && <ResetButton disabled={!changed} onClick={onReset} />}
				{/* A larger target for the mouse; the keyboard and assistive tech use the title. */}
				<IconButton label={title} aria-hidden="true" tabIndex={-1} onClick={toggle}>
					<ChevronDown
						className={`ease-out-soft size-[1.15rem] transition-transform duration-300 ${open ? '' : '-rotate-90'}`}
					/>
				</IconButton>
			</div>
			<div
				id={bodyId}
				className={`ease-out-soft grid transition-[grid-template-rows] duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
			>
				{/* Folded, its settings are out of reach of the keyboard and of assistive tech too. */}
				<div className="overflow-hidden" inert={!open}>
					<div className="grid gap-4 pt-1.5 pb-2">{children}</div>
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

export const ASPECT_LABELS: Record<FixedAspect, () => string> = {
	'free': () => m.aspect_free(),
	'original': () => m.aspect_original(),
	'1:1': () => '1:1',
	'4:5': () => '4:5',
	'5:4': () => '5:4',
	'4:3': () => '4:3',
	'3:4': () => '3:4',
	'3:2': () => '3:2',
	'2:3': () => '2:3',
	'16:9': () => '16:9',
	'9:16': () => '9:16',
	'21:9': () => '21:9',
};
