import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cn } from "../cn.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<AriaButtonProps, "className"> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
	className?: string;
};

const VARIANTS: Record<ButtonVariant, string> = {
	primary:
		"bg-[var(--accent-solid)] text-[var(--accent-on)] hover:brightness-110 pressed:brightness-95",
	secondary:
		"bg-[var(--bg-raised)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--bg-hover)] pressed:bg-[var(--bg-active)]",
	ghost:
		"text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] pressed:bg-[var(--bg-active)]",
	danger:
		"bg-[var(--danger-solid)] text-[var(--danger-on)] hover:brightness-110 pressed:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
	// 44px touch target is enforced by padding on coarse pointers, not by size.
	sm: "h-7 px-2.5 text-xs gap-1.5",
	md: "h-8 px-3 text-sm gap-2",
	lg: "h-10 px-4 text-md gap-2",
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
	return (
		<AriaButton
			{...props}
			className={cn(
				"inline-flex items-center justify-center rounded-[var(--radius-control)]",
				"font-medium whitespace-nowrap select-none cursor-default",
				"transition-[background-color,filter,border-color] duration-[var(--duration-micro)] ease-out",
				"disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
				"outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2",
				VARIANTS[variant],
				SIZES[size],
				className,
			)}
		/>
	);
}
