import { Input, NumberField, type NumberFieldProps } from "react-aria-components";
import { cn } from "../cn.ts";

export type NumberInputProps = Omit<NumberFieldProps, "className" | "value" | "onChange"> & {
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	suffix?: string;
	className?: string;
};

/** No native spinner: the stepper is replaced by keyboard and scroll gestures. */
export function NumberInput({
	value,
	onChange,
	min,
	max,
	step,
	disabled = false,
	suffix,
	className,
	...props
}: NumberInputProps) {
	return (
		<NumberField
			{...props}
			value={value}
			onChange={onChange}
			minValue={min}
			maxValue={max}
			step={step}
			isDisabled={disabled}
			formatOptions={{ useGrouping: false, maximumFractionDigits: fractionDigits(step) }}
			className={cn("relative inline-flex items-center", className)}
		>
			<Input
				className={cn(
					"tabular w-full rounded-[var(--radius-control)] border border-[var(--border)]",
					"bg-[var(--bg)] px-1.5 py-1 text-right text-xs text-[var(--text)]",
					"outline-none transition-colors duration-[var(--duration-micro)]",
					"hover:border-[var(--border-strong)]",
					"focus:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-1",
					"disabled:opacity-50",
					suffix !== undefined && "pr-6",
					"[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
				)}
			/>
			{suffix !== undefined && (
				<span
					aria-hidden
					className="pointer-events-none absolute right-1.5 text-2xs text-[var(--text-subtle)]"
				>
					{suffix}
				</span>
			)}
		</NumberField>
	);
}

function fractionDigits(step: number | undefined): number {
	if (step === undefined) return 0;
	return Math.max(0, (String(step).split(".")[1] ?? "").length);
}
