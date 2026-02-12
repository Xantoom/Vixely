import type { InputHTMLAttributes } from 'react';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
	label?: string;
	displayValue?: string;
	/** Fires on pointer/touch release — use for committing the final value */
	onCommit?: () => void;
}

export function Slider({ label, displayValue, id, className = '', onCommit, ...props }: SliderProps) {
	return (
		<div className={`flex flex-col gap-1.5 ${className}`}>
			{(label || displayValue) && (
				<div className="flex items-center justify-between">
					{label && (
						<label htmlFor={id} className="text-sm font-medium text-text-secondary">
							{label}
						</label>
					)}
					{displayValue && (
						<span className="text-sm font-mono text-text-tertiary tabular-nums">{displayValue}</span>
					)}
				</div>
			)}
			<input id={id} type="range" className="w-full" onPointerUp={onCommit} onTouchEnd={onCommit} {...props} />
		</div>
	);
}
