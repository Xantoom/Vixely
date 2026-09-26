import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { EDITOR_ORDER, EDITORS, type MediaKind } from '@/editors/registry';
import { m } from '@/paraglide/messages.js';
import { Tile } from '@/ui/Tile';

/** Shows which editor is open, in its colour, and lets the user jump to another one. */
export function EditorSwitcher({ current }: { current: MediaKind }) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
		};
		document.addEventListener('pointerdown', onPointerDown);
		const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
		const selected = rootRef.current?.querySelector<HTMLElement>('[role="menuitem"][aria-current="page"]');
		(selected ?? items?.[0])?.focus();
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
		};
	}, [open]);

	const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
		const active = document.activeElement;
		const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
		if (event.key === 'Escape') {
			setOpen(false);
			buttonRef.current?.focus();
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			items[(index + step + items.length) % items.length]?.focus();
		}
	};

	return (
		<div ref={rootRef} className="relative">
			<button
				ref={buttonRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				title={m.switch_editor()}
				onClick={() => {
					setOpen((value) => !value);
				}}
				className="hover:bg-surface flex h-11 items-center gap-2.5 rounded-sm pr-2.5 pl-1.5 transition-colors"
			>
				<Tile kind={current} size="lg" />
				<span className="text-body font-semibold tracking-[-0.015em] max-sm:sr-only">
					{EDITORS[current].label()}
				</span>
				<ChevronDown size={14} className="text-muted" aria-hidden="true" />
			</button>

			{open && (
				<div
					id={menuId}
					role="menu"
					aria-label={m.switch_editor()}
					onKeyDown={onMenuKeyDown}
					className="bg-bg absolute top-11 left-0 z-30 grid min-w-56 gap-0.5 rounded-md p-1.5 shadow-[0_0_0_1px_var(--line-2),0_16px_40px_-12px_rgb(0_0_0/0.3)]"
				>
					{EDITOR_ORDER.map((kind) => (
						<Link
							key={kind}
							to={EDITORS[kind].path}
							role="menuitem"
							aria-current={kind === current ? 'page' : undefined}
							onClick={() => {
								setOpen(false);
							}}
							className="text-body hover:bg-surface aria-[current=page]:bg-surface-2 flex items-center gap-3 rounded-xs px-2.5 py-2 font-medium"
						>
							<Tile kind={kind} size="sm" />
							{EDITORS[kind].label()}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
