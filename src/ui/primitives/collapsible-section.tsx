import { useId, useState, type ReactNode } from "react";
import { Button } from "react-aria-components";
import { cn } from "../cn.ts";

export type CollapsibleSectionProps = {
	title: string;
	children: ReactNode;
	/** Advanced panels start folded: the short path stays short. */
	defaultOpen?: boolean;
	badge?: ReactNode;
	className?: string;
};

export function CollapsibleSection({
	title,
	children,
	defaultOpen = false,
	badge,
	className,
}: CollapsibleSectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	const panelId = useId();

	return (
		<section className={cn("border-b border-[var(--border)] last:border-b-0", className)}>
			<Button
				onPress={() => setOpen((value) => !value)}
				aria-expanded={open}
				aria-controls={panelId}
				className={cn(
					"flex w-full cursor-default items-center gap-2 px-3 py-2 text-left outline-none",
					"text-sm font-medium text-[var(--text)] transition-colors duration-[var(--duration-micro)]",
					"hover:bg-[var(--bg-hover)]",
					"focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:-outline-offset-2",
				)}
			>
				<svg
					aria-hidden
					width="10"
					height="10"
					viewBox="0 0 10 10"
					className={cn(
						"shrink-0 fill-none stroke-[var(--text-muted)] stroke-[1.5]",
						"transition-transform duration-[var(--duration-panel)] ease-out",
						open && "rotate-90",
					)}
				>
					<path d="M3.5 2 L6.5 5 L3.5 8" />
				</svg>
				<span className="flex-1">{title}</span>
				{badge}
			</Button>
			{open && (
				<div id={panelId} className="flex flex-col gap-3 px-3 pb-3">
					{children}
				</div>
			)}
		</section>
	);
}
