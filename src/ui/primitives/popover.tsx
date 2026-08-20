import type { ReactNode } from "react";
import {
	Dialog,
	DialogTrigger,
	Popover as AriaPopover,
	type Placement,
} from "react-aria-components";
import { cn } from "../cn.ts";

export type PopoverProps = {
	trigger: ReactNode;
	children: ReactNode | ((close: () => void) => ReactNode);
	label: string;
	placement?: Placement;
	className?: string;
};

export function Popover({
	trigger,
	children,
	label,
	placement = "bottom",
	className,
}: PopoverProps) {
	return (
		<DialogTrigger>
			{trigger}
			<AriaPopover
				placement={placement}
				offset={6}
				className={cn(
					"z-50 rounded-[var(--radius-container)] border border-[var(--border)]",
					"bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-overlay)]",
					"entering:animate-in entering:fade-in entering:zoom-in-95 exiting:animate-out exiting:fade-out",
					className,
				)}
			>
				<Dialog aria-label={label} className="outline-none">
					{({ close }) => (typeof children === "function" ? children(close) : children)}
				</Dialog>
			</AriaPopover>
		</DialogTrigger>
	);
}
