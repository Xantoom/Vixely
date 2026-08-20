import type { ReactNode } from "react";
import {
	Menu as AriaMenu,
	MenuItem,
	MenuTrigger,
	Popover,
	Separator,
	SubmenuTrigger,
	type Key,
} from "react-aria-components";
import { cn } from "../cn.ts";

export type MenuEntry<T extends Key> =
	| { readonly type: "separator"; readonly id: T }
	| {
			readonly type: "item";
			readonly id: T;
			readonly label: string;
			readonly shortcut?: string;
			readonly disabled?: boolean;
			readonly danger?: boolean;
			readonly icon?: ReactNode;
	  };

export type MenuProps<T extends Key> = {
	trigger: ReactNode;
	label: string;
	entries: readonly MenuEntry<T>[];
	onAction: (id: T) => void;
	className?: string;
};

export function Menu<T extends Key>({
	trigger,
	label,
	entries,
	onAction,
	className,
}: MenuProps<T>) {
	return (
		<MenuTrigger>
			{trigger}
			<Popover
				offset={4}
				className={cn(
					"z-50 min-w-48 rounded-[var(--radius-container)] border border-[var(--border)]",
					"bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-overlay)]",
					"entering:animate-in entering:fade-in entering:zoom-in-95 exiting:animate-out exiting:fade-out",
					className,
				)}
			>
				<AriaMenu
					aria-label={label}
					onAction={(key) => onAction(key as T)}
					disabledKeys={entries
						.filter((entry) => entry.type === "item" && entry.disabled === true)
						.map((entry) => entry.id)}
					className="outline-none"
				>
					{entries.map((entry) =>
						entry.type === "separator" ? (
							<Separator key={String(entry.id)} className="my-1 h-px bg-[var(--border)]" />
						) : (
							<MenuItem
								key={String(entry.id)}
								id={entry.id}
								textValue={entry.label}
								className={cn(
									"flex cursor-default items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5",
									"text-sm outline-none",
									entry.danger === true ? "text-[var(--danger)]" : "text-[var(--text)]",
									"focused:bg-[var(--bg-hover)]",
									"disabled:text-[var(--text-subtle)] disabled:cursor-not-allowed",
								)}
							>
								{entry.icon}
								<span className="flex-1 truncate">{entry.label}</span>
								{entry.shortcut !== undefined && (
									<kbd className="tabular text-2xs text-[var(--text-subtle)]">{entry.shortcut}</kbd>
								)}
							</MenuItem>
						),
					)}
				</AriaMenu>
			</Popover>
		</MenuTrigger>
	);
}

export { SubmenuTrigger };
