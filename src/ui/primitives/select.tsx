import {
	Button,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	Select as AriaSelect,
	SelectValue,
	type Key,
} from "react-aria-components";
import { cn } from "../cn.ts";

export type SelectOption<T extends Key> = {
	readonly id: T;
	readonly label: string;
	readonly description?: string;
	readonly disabled?: boolean;
	/** Shown next to a disabled entry: never hide a codec, explain it. */
	readonly disabledReason?: string;
};

export type SelectProps<T extends Key> = {
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: readonly SelectOption<T>[];
	disabled?: boolean;
	hideLabel?: boolean;
	className?: string;
};

export function Select<T extends Key>({
	label,
	value,
	onChange,
	options,
	disabled = false,
	hideLabel = false,
	className,
}: SelectProps<T>) {
	return (
		<AriaSelect
			selectedKey={value}
			onSelectionChange={(key) => onChange(key as T)}
			isDisabled={disabled}
			disabledKeys={options.filter((option) => option.disabled === true).map((o) => o.id)}
			className={cn("flex flex-col gap-1", className)}
		>
			<Label className={cn("text-xs text-[var(--text-muted)]", hideLabel && "sr-only")}>
				{label}
			</Label>
			<Button
				className={cn(
					"flex h-8 w-full items-center justify-between gap-2 rounded-[var(--radius-control)]",
					"border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)]",
					"cursor-default outline-none transition-colors duration-[var(--duration-micro)]",
					"hover:border-[var(--border-strong)]",
					"focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2",
					"disabled:opacity-50",
				)}
			>
				<SelectValue className="truncate placeholder-shown:text-[var(--text-subtle)]" />
				<svg
					aria-hidden
					width="10"
					height="10"
					viewBox="0 0 10 10"
					className="shrink-0 fill-none stroke-current stroke-[1.5]"
				>
					<path d="M2 4 L5 7 L8 4" />
				</svg>
			</Button>
			<Popover
				offset={4}
				className={cn(
					"z-50 max-h-72 w-(--trigger-width) overflow-auto rounded-[var(--radius-container)]",
					"border border-[var(--border)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-overlay)]",
					"entering:animate-in entering:fade-in entering:zoom-in-95 exiting:animate-out exiting:fade-out",
				)}
			>
				<ListBox className="outline-none">
					{options.map((option) => (
						<ListBoxItem
							key={String(option.id)}
							id={option.id}
							textValue={option.label}
							className={cn(
								"flex cursor-default flex-col rounded-[var(--radius-control)] px-2 py-1.5 outline-none",
								"text-sm text-[var(--text)]",
								"focused:bg-[var(--bg-hover)] selected:text-[var(--accent)]",
								"disabled:text-[var(--text-subtle)] disabled:cursor-not-allowed",
							)}
						>
							<span className="flex items-center justify-between gap-2">
								{option.label}
								{option.disabled === true && option.disabledReason !== undefined && (
									<span className="text-2xs text-[var(--text-subtle)]">
										{option.disabledReason}
									</span>
								)}
							</span>
							{option.description !== undefined && (
								<span className="text-xs text-[var(--text-muted)]">{option.description}</span>
							)}
						</ListBoxItem>
					))}
				</ListBox>
			</Popover>
		</AriaSelect>
	);
}
