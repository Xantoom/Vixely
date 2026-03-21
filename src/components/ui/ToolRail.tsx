import type { LucideIcon } from 'lucide-react';
import { useCallback, useRef, type KeyboardEvent } from 'react';

export interface ToolRailItem<T extends string = string> {
	id: T;
	label: string;
	icon: LucideIcon;
	hasActivity?: boolean;
	disabled?: boolean;
}

interface ToolRailProps<T extends string> {
	items: readonly ToolRailItem<T>[];
	activeId: T | null;
	onChange: (id: T) => void;
	direction?: 'horizontal' | 'vertical';
	ariaLabel: string;
	className?: string;
}

export function ToolRail<T extends string>({
	items,
	activeId,
	onChange,
	direction = 'horizontal',
	ariaLabel,
	className,
}: ToolRailProps<T>) {
	const railRef = useRef<HTMLDivElement>(null);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			const isH = direction === 'horizontal';
			const prevKey = isH ? 'ArrowLeft' : 'ArrowUp';
			const nextKey = isH ? 'ArrowRight' : 'ArrowDown';

			if (e.key !== prevKey && e.key !== nextKey) return;
			e.preventDefault();

			const enabled = items.filter((i) => !i.disabled);
			if (enabled.length === 0) return;

			const currentIndex = enabled.findIndex((i) => i.id === activeId);
			let nextIndex: number;
			if (e.key === nextKey) {
				nextIndex = currentIndex < enabled.length - 1 ? currentIndex + 1 : 0;
			} else {
				nextIndex = currentIndex > 0 ? currentIndex - 1 : enabled.length - 1;
			}

			const nextItem = enabled[nextIndex];
			if (nextItem) {
				onChange(nextItem.id);
				const btn = railRef.current?.querySelector<HTMLButtonElement>(`[data-tool-id="${nextItem.id}"]`);
				btn?.focus();
			}
		},
		[items, activeId, onChange, direction],
	);

	const isVertical = direction === 'vertical';

	return (
		<div
			ref={railRef}
			role="toolbar"
			aria-label={ariaLabel}
			aria-orientation={direction}
			onKeyDown={handleKeyDown}
			className={`flex ${isVertical ? 'flex-col gap-0.5 py-2 px-1' : 'gap-0.5 px-2 py-1.5'} ${className ?? ''}`}
		>
			{items.map((item) => {
				const active = item.id === activeId;
				const Icon = item.icon;
				return (
					<button
						key={item.id}
						type="button"
						data-tool-id={item.id}
						tabIndex={active ? 0 : -1}
						aria-pressed={active}
						aria-label={item.label}
						title={item.label}
						disabled={item.disabled}
						onClick={() => {
							if (!item.disabled) onChange(item.id);
						}}
						className={`relative flex items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
							isVertical ? 'h-10 w-10' : 'h-9 w-9'
						} ${
							active
								? 'bg-accent/14 text-accent'
								: 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/40'
						} ${item.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
					>
						<Icon size={isVertical ? 18 : 16} strokeWidth={active ? 2.2 : 1.8} />
						{item.hasActivity && (
							<span
								className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${
									active ? 'bg-accent' : 'bg-accent/65'
								}`}
								aria-hidden
							/>
						)}
					</button>
				);
			})}
		</div>
	);
}
