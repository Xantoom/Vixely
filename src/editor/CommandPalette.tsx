import { Search } from 'lucide-react';
import { type ComponentType, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { m } from '@/paraglide/messages.js';

export interface Command {
	id: string;
	label: string;
	icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
	/** The key that does the same, shown beside it. */
	keys?: string;
	run: () => void;
}

/** A modal dialog drawn by the app: centred near the top, closed by Escape or a click outside. */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = ref.current;
		// Removing the element closes it: closing it here would report a close to the parent, which
		// React's double mount in development would take for the user's.
		if (dialog && !dialog.open) dialog.showModal();
	}, []);
	return (
		<dialog
			ref={ref}
			aria-label={label}
			onClose={onClose}
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			className="bg-bg text-ink animate-[pop_0.24s_var(--ease-spring)] mx-auto mt-[12vh] w-[min(36rem,calc(100%-2rem))] overflow-hidden rounded-md p-0 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.35),0_0_0_1px_var(--line)] backdrop:bg-black/35 backdrop:backdrop-blur-[3px]"
		>
			{children}
		</dialog>
	);
}

/** Folds accents and case, so « regl » finds « Réglages ». */
function fold(text: string): string {
	return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Every action of the editor, found by typing a few letters (Ctrl or ⌘ + K). */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState(0);
	const listId = useId();
	const shown = commands.filter((command) => fold(command.label).includes(fold(query.trim())));
	const index = Math.min(selected, shown.length - 1);
	const run = (command: Command | undefined) => {
		if (!command) return;
		onClose();
		command.run();
	};
	return (
		<Dialog label={m.command_search()} onClose={onClose}>
			<div className="border-line flex items-center gap-3 border-b px-5">
				<Search className="text-muted size-5 flex-none" aria-hidden="true" />
				<input
					autoFocus
					role="combobox"
					aria-expanded="true"
					aria-controls={listId}
					aria-activedescendant={shown[index] ? `${listId}-${shown[index].id}` : undefined}
					value={query}
					placeholder={m.command_search()}
					onChange={(event) => {
						setQuery(event.target.value);
						setSelected(0);
					}}
					onKeyDown={(event) => {
						if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
							event.preventDefault();
							const step = event.key === 'ArrowDown' ? 1 : -1;
							setSelected((index + step + shown.length) % Math.max(1, shown.length));
						} else if (event.key === 'Enter') {
							event.preventDefault();
							run(shown[index]);
						}
					}}
					className="text-lead h-14 flex-1 bg-transparent outline-none"
				/>
			</div>
			<div id={listId} role="listbox" aria-label={m.command_search()} className="max-h-[22rem] overflow-auto p-2">
				{shown.length === 0 && <p className="text-ui text-muted px-3 py-4">{m.command_none()}</p>}
				{shown.map((command, position) => {
					const Icon = command.icon;
					return (
						<div
							key={command.id}
							id={`${listId}-${command.id}`}
							role="option"
							aria-selected={position === index}
							onPointerMove={() => {
								setSelected(position);
							}}
							onClick={() => {
								run(command);
							}}
							className="text-ui aria-selected:bg-ed-soft aria-selected:text-ed-text flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2.5"
						>
							<Icon className="size-5 flex-none" aria-hidden="true" />
							<span className="flex-1">{command.label}</span>
							{command.keys && <Keys keys={command.keys} />}
						</div>
					);
				})}
			</div>
		</Dialog>
	);
}

/** A shortcut, each key in its own cap: "Ctrl Z". */
export function Keys({ keys }: { keys: string }) {
	return (
		<span className="flex gap-1">
			{keys.split(' ').map((key) => (
				<kbd
					key={key}
					className="text-caption text-muted min-w-6 rounded-[0.35rem] px-1.5 py-0.5 text-center font-mono shadow-[inset_0_0_0_1px_var(--line-2)]"
				>
					{key}
				</kbd>
			))}
		</span>
	);
}

export interface ShortcutGroup {
	title: string;
	shortcuts: [label: string, keys: string][];
}

/** The keyboard shortcuts of the editor on screen (the ? key). */
export function ShortcutHelp({ groups, onClose }: { groups: ShortcutGroup[]; onClose: () => void }) {
	return (
		<Dialog label={m.shortcuts_title()} onClose={onClose}>
			<div className="grid max-h-[70vh] gap-6 overflow-auto px-6 pt-5 pb-6">
				<h2 className="text-title font-[650] tracking-[-0.02em]">{m.shortcuts_title()}</h2>
				{groups.map((group) => (
					<section key={group.title} className="grid gap-1">
						<h3 className="text-caption text-muted font-semibold tracking-[0.06em] uppercase">
							{group.title}
						</h3>
						{group.shortcuts.map(([label, keys]) => (
							<div
								key={label}
								className="border-line text-ui flex items-center justify-between gap-4 border-b py-2 last:border-b-0"
							>
								<span>{label}</span>
								<Keys keys={keys} />
							</div>
						))}
					</section>
				))}
			</div>
		</Dialog>
	);
}
