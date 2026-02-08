import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
	glass?: boolean;
}

export function Card({ glass = false, className = '', children, ...props }: CardProps) {
	return (
		<div className={`rounded-xl border border-border ${glass ? 'glass' : 'bg-surface'} ${className}`} {...props}>
			{children}
		</div>
	);
}
