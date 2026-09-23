import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

const VARIANTS: Record<Variant, string> = {
	// The primary action takes the colour of the current editor, neutral elsewhere.
	primary:
		'bg-ed text-ed-ink font-semibold hover:brightness-[1.07] disabled:opacity-45 disabled:hover:brightness-100',
	secondary: 'text-ink font-medium shadow-[inset_0_0_0_1px_var(--line-2)] hover:bg-surface disabled:opacity-45',
};

export function Button({
	variant = 'secondary',
	className = '',
	type = 'button',
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
	return (
		<button
			type={type}
			className={`text-ui inline-flex h-9 items-center justify-center gap-2 rounded-sm px-4 whitespace-nowrap transition-[filter,background-color] duration-150 ${VARIANTS[variant]} ${className}`}
			{...props}
		/>
	);
}

/** Square button for a single icon. The label is announced and shown as a tooltip. */
export function IconButton({
	label,
	children,
	className = '',
	type = 'button',
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
	return (
		<button
			type={type}
			aria-label={label}
			title={label}
			className={`text-muted enabled:hover:bg-surface enabled:hover:text-ink grid size-[34px] flex-none place-items-center rounded-sm transition-colors duration-150 disabled:opacity-40 ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}
