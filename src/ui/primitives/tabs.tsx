import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs as AriaTabs, type Key } from "react-aria-components";
import { cn } from "../cn.ts";

export type TabDefinition<T extends Key> = {
	readonly id: T;
	readonly label: string;
	readonly icon?: ReactNode;
	readonly content: ReactNode;
};

export type TabsProps<T extends Key> = {
	label: string;
	tabs: readonly TabDefinition<T>[];
	value?: T;
	onChange?: (value: T) => void;
	className?: string;
};

export function Tabs<T extends Key>({ label, tabs, value, onChange, className }: TabsProps<T>) {
	return (
		<AriaTabs
			selectedKey={value}
			onSelectionChange={(key) => onChange?.(key as T)}
			className={cn("flex flex-col", className)}
		>
			<TabList aria-label={label} className="flex gap-1 border-b border-[var(--border)] px-1">
				{tabs.map((tab) => (
					<Tab
						key={String(tab.id)}
						id={tab.id}
						className={cn(
							"-mb-px inline-flex cursor-default items-center gap-1.5 border-b-2 border-transparent px-2 py-1.5",
							"text-sm text-[var(--text-muted)] outline-none transition-colors duration-[var(--duration-micro)]",
							"hover:text-[var(--text)]",
							"selected:border-[var(--accent)] selected:text-[var(--text)]",
							"focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2",
						)}
					>
						{tab.icon}
						{tab.label}
					</Tab>
				))}
			</TabList>
			{tabs.map((tab) => (
				<TabPanel key={String(tab.id)} id={tab.id} className="flex-1 outline-none">
					{tab.content}
				</TabPanel>
			))}
		</AriaTabs>
	);
}
