import { Switch, type SwitchProps } from "react-aria-components";
import { cn } from "../cn.ts";

export type ToggleProps = Omit<SwitchProps, "className" | "children"> & {
	label: string;
	description?: string;
	className?: string;
};

export function Toggle({ label, description, className, ...props }: ToggleProps) {
	return (
		<Switch
			{...props}
			className={cn(
				"group flex items-start gap-2.5 py-1 cursor-default select-none",
				"disabled:opacity-50",
				className,
			)}
		>
			<span
				className={cn(
					"mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full border border-[var(--border)] p-0.5",
					"bg-[var(--bg-active)] transition-colors duration-[var(--duration-micro)]",
					"group-selected:bg-[var(--accent-solid)] group-selected:border-[var(--accent-solid)]",
					"group-focus-visible:outline-2 group-focus-visible:outline-[var(--focus-ring)] group-focus-visible:outline-offset-2",
				)}
			>
				<span
					className={cn(
						"size-3 rounded-full bg-[var(--bg-raised)] shadow-sm",
						"transition-transform duration-[var(--duration-micro)] ease-out",
						"group-selected:translate-x-3 group-selected:bg-[var(--accent-on)]",
					)}
				/>
			</span>
			<span className="flex flex-col">
				<span className="text-sm leading-tight text-[var(--text)]">{label}</span>
				{description !== undefined && (
					<span className="text-xs text-[var(--text-muted)]">{description}</span>
				)}
			</span>
		</Switch>
	);
}
