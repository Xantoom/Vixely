interface ToggleProps {
	enabled: boolean;
	onToggle: () => void;
	label: string;
	className?: string;
}

export function Toggle({ enabled, onToggle, label, className = '' }: ToggleProps) {
	return (
		<button
			onClick={onToggle}
			type="button"
			role="switch"
			aria-checked={enabled}
			aria-label={label}
			className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
				enabled ? 'bg-accent' : 'bg-border'
			} ${className}`}
		>
			<div
				aria-hidden
				className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
					enabled ? 'translate-x-4' : 'translate-x-0'
				}`}
			/>
		</button>
	);
}
