import { ChevronDown } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';

interface CollapsibleSectionProps {
	/** Section title */
	title: string;
	/** Number of active changes in this section (shows badge when > 0) */
	changeCount?: number;
	/** Start collapsed */
	defaultCollapsed?: boolean;
	/** Content */
	children: React.ReactNode;
}

/**
 * Collapsible panel section with smooth height animation.
 * Used in editor sidebars to reduce visual density.
 *
 * UX: 200ms ease-out transition (micro-interaction best practice).
 * Accessibility: aria-expanded, keyboard Enter/Space toggle.
 */
export const CollapsibleSection = memo(function CollapsibleSection({
	title,
	changeCount = 0,
	defaultCollapsed = false,
	children,
}: CollapsibleSectionProps) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);
	const contentRef = useRef<HTMLDivElement>(null);

	const toggle = useCallback(() => {
		setCollapsed((prev) => !prev);
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		},
		[toggle],
	);

	return (
		<div className="flex flex-col">
			{/* Header */}
			<button
				type="button"
				onClick={toggle}
				onKeyDown={handleKeyDown}
				aria-expanded={!collapsed}
				className="flex items-center justify-between py-1.5 cursor-pointer group"
			>
				<span className="flex items-center gap-2">
					<span className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary group-hover:text-text-secondary transition-colors">
						{title}
					</span>
					{changeCount > 0 && (
						<span className="h-4 min-w-4 flex items-center justify-center rounded-full bg-accent/15 px-1 text-[10px] font-bold text-accent tabular-nums">
							{changeCount}
						</span>
					)}
				</span>
				<ChevronDown
					size={12}
					className={`text-text-tertiary transition-transform duration-200 ease-out ${
						collapsed ? '-rotate-90' : 'rotate-0'
					}`}
				/>
			</button>

			{/* Content — animated via grid rows */}
			<div
				className="grid transition-[grid-template-rows] duration-200 ease-out"
				style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
			>
				<div ref={contentRef} className="overflow-hidden">
					<div className="flex flex-col gap-3 pb-1">{children}</div>
				</div>
			</div>
		</div>
	);
});
