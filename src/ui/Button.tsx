// Buttons are the design system's. In an editor, its primary look and pressed state take the editor's colour
// (app.css maps the design system's fill and accent onto it).
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button as DsButton, buttonProps } from 'xantoom-design/react';

export function Button({
	variant = 'secondary',
	size = 'md',
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
	size?: 'sm' | 'md' | 'lg';
	/** Working: a spinner over the kept label, no second press, and the keyboard focus stays, unlike `disabled`. */
	busy?: boolean;
}) {
	return <DsButton variant={variant} size={size} {...props} />;
}

/**
 * Square button for a single icon. The label is announced and shown as a tooltip (the app's, from `title`), unless
 * `tip` is false: beside words that already say it.
 */
export function IconButton({
	label,
	tip = true,
	size = 'md',
	className,
	type = 'button',
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	label: string;
	tip?: boolean;
	size?: 'sm' | 'md';
	children: ReactNode;
}) {
	const look = buttonProps({ variant: 'ghost', size });
	return (
		<button
			{...look}
			data-icon=""
			type={type}
			aria-label={label}
			title={tip ? label : undefined}
			className={className ? `${look.className} ${className}` : look.className}
			{...props}
		/>
	);
}
