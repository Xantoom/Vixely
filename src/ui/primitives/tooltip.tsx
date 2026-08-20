import type { ReactNode } from "react";
import {
	Tooltip as AriaTooltip,
	OverlayArrow,
	TooltipTrigger,
	type Placement,
} from "react-aria-components";

export type TooltipProps = {
	content: ReactNode;
	children: ReactNode;
	placement?: Placement;
	/** Native tooltips are never used; delay matches the design system. */
	delay?: number;
};

export function Tooltip({ content, children, placement = "top", delay = 500 }: TooltipProps) {
	return (
		<TooltipTrigger delay={delay} closeDelay={0}>
			{children}
			<AriaTooltip
				placement={placement}
				offset={6}
				className="z-50 max-w-64 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-overlay)] px-2 py-1 text-xs text-[var(--text)] shadow-[var(--shadow-overlay)] entering:animate-in entering:fade-in entering:zoom-in-95 exiting:animate-out exiting:fade-out"
			>
				<OverlayArrow>
					<svg
						width={8}
						height={8}
						viewBox="0 0 8 8"
						className="fill-[var(--bg-overlay)] stroke-[var(--border)]"
					>
						<path d="M0 0 L4 4 L8 0" />
					</svg>
				</OverlayArrow>
				{content}
			</AriaTooltip>
		</TooltipTrigger>
	);
}
