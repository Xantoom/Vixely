// Buttons are the design system's. In an editor, its primary look and pressed state take the editor's colour
// (app.css maps the design system's fill and accent onto it).
import type { ButtonHTMLAttributes } from 'react';
import { Button as DsButton } from 'xantoom-design/react';

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

/** A square button for one icon: named by `label`, which its tooltip repeats unless `tooltip` is false. */
export { IconButton } from 'xantoom-design/react';
