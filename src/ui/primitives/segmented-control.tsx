import type { ReactNode } from "react";
import { Radio, RadioGroup, type Key } from "react-aria-components";
import { cn } from "../cn.ts";

export type SegmentedOption<T extends Key> = {
	readonly id: T;
	readonly label: string;
	readonly icon?: ReactNode;
};

export type SegmentedControlProps<T extends Key> = {
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: readonly SegmentedOption<T>[];
	hideLabel?: boolean;
	iconOnly?: boolean;
	size?: "sm" | "md";
	className?: string;
};

export function SegmentedControl<T extends Key>({
	label,
	value,
	onChange,
	options,
	hideLabel = true,
	iconOnly = false,
	size = "md",
	className,
}: SegmentedControlProps<T>) {
	return (
		<RadioGroup
			aria-label={hideLabel ? label : undefined}
			value={String(value)}
			onChange={(next) => onChange(next as T)}
			orientation="horizontal"
			className={cn("flex flex-col gap-1", className)}
		>
			{!hideLabel && <span className="text-xs text-[var(--text-muted)]">{label}</span>}
			<div className="inline-flex gap-0.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg)] p-0.5">
				{options.map((option) => (
					<Radio
						key={String(option.id)}
						value={String(option.id)}
						aria-label={iconOnly ? option.label : undefined}
						className={cn(
							"inline-flex flex-1 cursor-default items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-1px)]",
							"text-[var(--text-muted)] outline-none select-none whitespace-nowrap",
							"transition-colors duration-[var(--duration-micro)]",
							"hover:text-[var(--text)]",
							"selected:bg-[var(--bg-raised)] selected:text-[var(--text)] selected:shadow-sm",
							"focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-1",
							size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm",
						)}
					>
						{option.icon}
						{!iconOnly && option.label}
					</Radio>
				))}
			</div>
		</RadioGroup>
	);
}
