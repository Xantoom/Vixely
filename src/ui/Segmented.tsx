import type { ReactNode } from 'react';

/** A few choices side by side in one pill, the chosen one raised: views of a panel, modes. */
export function Segmented<T extends string>({
	label,
	value,
	options,
	onChange,
	className = '',
}: {
	label: string;
	value: T;
	options: { value: T; label: ReactNode; title?: string }[];
	onChange: (value: T) => void;
	className?: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className={`bg-surface flex gap-0.5 rounded-md p-0.5 ${className}`}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					role="radio"
					aria-checked={option.value === value}
					title={option.title}
					onClick={() => {
						onChange(option.value);
					}}
					className="text-ui text-muted hover:text-ink aria-checked:bg-bg aria-checked:text-ink flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[0.45rem] px-2.5 font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 aria-checked:shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--line)]"
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
