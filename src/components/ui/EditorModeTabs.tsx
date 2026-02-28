import type { LucideIcon } from 'lucide-react';

export interface EditorModeTabItem<T extends string = string> {
	id: T;
	label: string;
	icon?: LucideIcon;
	description?: string;
	hasActivity?: boolean;
	disabled?: boolean;
}

interface EditorModeTabsProps<T extends string> {
	value: T;
	items: readonly EditorModeTabItem<T>[];
	onChange: (next: T) => void;
	ariaLabel: string;
	className?: string;
}

export function EditorModeTabs<T extends string>({
	value,
	items,
	onChange,
	ariaLabel,
	className,
}: EditorModeTabsProps<T>) {
	if (items.length === 0) return null;

	return (
		<div className={className}>
			<div
				role="group"
				aria-label={ariaLabel}
				className="flex gap-1 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{items.map((item) => {
					const active = value === item.id;
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							type="button"
							aria-pressed={active}
							aria-label={item.label}
							disabled={item.disabled}
							title={item.description ? `${item.label}: ${item.description}` : item.label}
							onClick={() => {
								if (!item.disabled) onChange(item.id);
							}}
							className={`relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
								active
									? 'border-accent/35 bg-accent/10 text-accent'
									: 'border-border/65 bg-surface-raised/25 text-text-tertiary hover:border-border hover:bg-surface-raised/50 hover:text-text-secondary'
							} ${item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
						>
							{Icon && <Icon size={14} strokeWidth={active ? 2.2 : 1.9} />}
							<span>{item.label}</span>
							{item.hasActivity && (
								<span
									className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
										active ? 'bg-accent' : 'bg-accent/65'
									}`}
									aria-hidden
								/>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
