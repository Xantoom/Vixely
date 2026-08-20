import { ProgressBar, Label } from "react-aria-components";
import { cn } from "../cn.ts";

export type ProgressProps = {
	label: string;
	/** 0–1, or null for an indeterminate operation. */
	value: number | null;
	showValue?: boolean;
	className?: string;
};

export function Progress({ label, value, showValue = true, className }: ProgressProps) {
	const percent = value === null ? null : Math.round(value * 100);
	return (
		<ProgressBar
			value={percent ?? undefined}
			isIndeterminate={value === null}
			className={cn("flex flex-col gap-1", className)}
		>
			<div className="flex items-baseline justify-between gap-2">
				<Label className="text-xs text-[var(--text-muted)]">{label}</Label>
				{showValue && percent !== null && (
					<span className="tabular text-xs text-[var(--text-muted)]">{percent}%</span>
				)}
			</div>
			<div className="h-1 overflow-hidden rounded-full bg-[var(--bg-active)]">
				<div
					className={cn(
						"h-full rounded-full bg-[var(--accent)]",
						value === null
							? "w-1/3 animate-[progress-indeterminate_1.4s_ease-in-out_infinite]"
							: "transition-[width] duration-[var(--duration-panel)] ease-out",
					)}
					style={value === null ? undefined : { width: `${percent ?? 0}%` }}
				/>
			</div>
		</ProgressBar>
	);
}
