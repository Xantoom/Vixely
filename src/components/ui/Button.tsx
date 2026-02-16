import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
}

const variantStyles: Record<Variant, string> = {
	primary: 'bg-accent text-bg font-semibold hover:bg-accent/90 active:bg-accent/80',
	secondary: 'bg-surface-raised text-text hover:bg-surface-raised/80 active:bg-surface-raised/60',
	ghost: 'bg-transparent text-text-secondary hover:text-text hover:bg-white/5 active:bg-white/8',
	danger: 'bg-danger/10 text-danger hover:bg-danger/15 active:bg-danger/20',
};

const sizeStyles: Record<Size, string> = {
	sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
	md: 'h-10 px-4 text-sm gap-2 rounded-lg',
	lg: 'h-12 px-5 text-sm gap-2.5 rounded-lg',
	icon: 'h-10 w-10 rounded-lg justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ variant = 'primary', size = 'md', className = '', ...props }, ref) => (
		<button
			ref={ref}
			className={`inline-flex items-center justify-center font-medium transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
			{...props}
		/>
	),
);

Button.displayName = 'Button';
