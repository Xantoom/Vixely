import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cn } from "../cn.ts";
import { Tooltip } from "./tooltip.tsx";

export type IconButtonProps = Omit<AriaButtonProps, "className" | "children"> & {
	/** Always required: an icon-only control has no accessible name otherwise. */
	label: string;
	children: React.ReactNode;
	size?: "sm" | "md" | "lg";
	variant?: "ghost" | "solid";
	active?: boolean;
	className?: string;
	/** Suppresses the tooltip when the control already sits in a labelled row. */
	hideTooltip?: boolean;
};

const SIZES = {
	sm: "size-7",
	md: "size-8",
	lg: "size-10",
} as const;

export function IconButton({
	label,
	children,
	size = "md",
	variant = "ghost",
	active = false,
	className,
	hideTooltip = false,
	...props
}: IconButtonProps) {
	const button = (
		<AriaButton
			{...props}
			aria-label={label}
			aria-pressed={props["aria-pressed"] ?? (active ? true : undefined)}
			className={cn(
				"inline-flex items-center justify-center rounded-[var(--radius-control)] shrink-0",
				"transition-[background-color,color] duration-[var(--duration-micro)] ease-out",
				"cursor-default outline-none",
				"focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2",
				"disabled:opacity-50 disabled:pointer-events-none",
				variant === "solid"
					? "bg-[var(--bg-raised)] border border-[var(--border)]"
					: "bg-transparent",
				active
					? "bg-[var(--accent-surface)] text-[var(--accent)]"
					: "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]",
				SIZES[size],
				className,
			)}
		>
			{children}
		</AriaButton>
	);

	return hideTooltip ? button : <Tooltip content={label}>{button}</Tooltip>;
}
