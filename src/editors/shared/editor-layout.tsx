import type { ReactNode } from "react";
import { cn } from "~/ui/cn.ts";

export type EditorLayoutProps = {
	/** The working canvas. It takes the room; the chrome retreats. */
	canvas: ReactNode;
	/** Right-hand inspector: tool settings, export panel. */
	panel: ReactNode;
	/** Optional left rail of tools. */
	rail?: ReactNode;
	/** Optional bottom strip: timeline, frame strip, waveform. */
	strip?: ReactNode;
	/** Shown on wide screens as a second permanent panel instead of stretching. */
	secondaryPanel?: ReactNode;
	className?: string;
};

/**
 * Desktop-first, but the panels fold rather than shrink (design system §7):
 * below 1024px the inspector becomes a bottom sheet, above 1600px a second
 * panel appears instead of the canvas growing indefinitely.
 */
export function EditorLayout({
	canvas,
	panel,
	rail,
	strip,
	secondaryPanel,
	className,
}: EditorLayoutProps) {
	return (
		<div className={cn("flex min-h-0 flex-1 flex-col lg:flex-row", className)}>
			{rail !== undefined && (
				<div className="flex shrink-0 gap-1 border-b border-[var(--border)] bg-[var(--bg-sunken)] p-1 lg:flex-col lg:border-b-0 lg:border-r">
					{rail}
				</div>
			)}

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--bg-deep)]">{canvas}</div>
				{strip !== undefined && (
					<div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-sunken)]">
						{strip}
					</div>
				)}
			</div>

			<aside className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-[var(--border)] bg-[var(--bg-sunken)] lg:w-72 lg:border-l lg:border-t-0 2xl:w-80">
				{panel}
			</aside>

			{secondaryPanel !== undefined && (
				<aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-sunken)] 2xl:flex">
					{secondaryPanel}
				</aside>
			)}
		</div>
	);
}
