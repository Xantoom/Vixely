interface IconButtonProps {
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	title: string;
	children: React.ReactNode;
	className?: string;
	onPointerDown?: (e: React.PointerEvent) => void;
	onPointerUp?: (e: React.PointerEvent) => void;
	onPointerLeave?: (e: React.PointerEvent) => void;
	onPointerCancel?: (e: React.PointerEvent) => void;
}

export function IconButton({
	onClick,
	disabled,
	active,
	title,
	children,
	className,
	onPointerDown,
	onPointerUp,
	onPointerLeave,
	onPointerCancel,
}: IconButtonProps) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			title={title}
			type="button"
			aria-label={title}
			onPointerDown={onPointerDown}
			onPointerUp={onPointerUp}
			onPointerLeave={onPointerLeave}
			onPointerCancel={onPointerCancel}
			className={`h-8 w-8 flex items-center justify-center rounded-md transition-all cursor-pointer
				${active ? 'bg-accent/15 text-accent' : 'text-text-tertiary hover:text-text hover:bg-surface-raised/60'}
				${disabled ? 'opacity-30 pointer-events-none' : ''}
				${className ?? ''}`}
		>
			{children}
		</button>
	);
}

export function ToolbarSeparator() {
	return <div className="w-px h-5 bg-border mx-1" />;
}
