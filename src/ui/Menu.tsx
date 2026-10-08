import { Check } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { layerOf } from './layer';
import { type Place, placeList } from './place';
import { usePopover } from './use-popover';

export interface MenuItem<T extends string> {
	value: T;
	label: string;
	/** Drawn before the label: a flag, an icon. */
	leading?: ReactNode;
	/** Shown dimmed after the label, such as a codec. */
	detail?: string;
	/** Shown dimmed under the label, such as what a track is made of. */
	description?: string;
	disabled?: boolean;
	/** A rule under it, setting it apart from the choices after it, such as Off. */
	divider?: boolean;
}

/**
 * A button that opens a short menu of choices, one of them current: the language, the theme, the
 * track played. Unlike `Dropdown`, the button is drawn by the caller (an icon, a flag) and shows
 * nothing of the choice by itself.
 *
 * Keyboard: arrows, Home and End move, Enter or Space picks, Escape closes.
 */
export function Menu<T extends string>({
	label,
	value,
	items,
	onChange,
	children,
	title,
	header,
	rows,
	align = 'end',
	className = '',
	buttonClassName = '',
}: {
	/** Announced name of the menu and its button, and the button's tooltip. */
	label: string;
	value: T | null;
	items: MenuItem<T>[];
	onChange: (value: T) => void;
	/** The button's face. */
	children: ReactNode;
	/** A heading at the top of the menu. */
	title?: string;
	/** What the menu is about, above its choices, such as a file's whole name. */
	header?: ReactNode;
	/** Choices shown at once; past them the list scrolls, the next one peeking out. */
	rows?: number;
	/** Which edge of the button the menu lines up with. */
	align?: 'start' | 'end';
	className?: string;
	buttonClassName?: string;
}) {
	const [active, setActive] = useState(-1);
	// The choice under the pointer or the keyboard is lit; on opening by a click, none is.
	const [lit, setLit] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);
	/** The choice was last moved by the pointer, not the keyboard. */
	const pointed = useRef(false);
	const menuId = useId();
	const selected = items.findIndex((item) => item.value === value);

	const popover = usePopover((button, panel): Place | null => {
		const list = listRef.current;
		if (!list) return null;
		// The title stays put above the choices: only the list scrolls.
		const top = panel.offsetHeight - list.offsetHeight;
		const cap = rowsHeight(list, rows);
		const found = placeList(
			button.getBoundingClientRect(),
			{ width: panel.offsetWidth, height: top + Math.min(list.scrollHeight, cap) },
			align,
		);
		return { ...found, maxHeight: Math.min(found.maxHeight - top, cap) };
	});
	const { open, place, media, buttonRef, popoverRef, close } = popover;

	const show = (byKeyboard: boolean) => {
		setLit(byKeyboard);
		pointed.current = false;
		setActive(selected >= 0 ? selected : items.findIndex((item) => !item.disabled));
		popover.show();
	};

	const placed = place !== null;

	// The choice under the keyboard stays in sight in a list that scrolls; one under the pointer
	// is already seen, and scrolling to it would move the list under the pointer.
	useEffect(() => {
		if (!placed || active < 0 || pointed.current) return;
		listRef.current?.querySelectorAll('[role=menuitemradio]')[active]?.scrollIntoView({ block: 'nearest' });
	}, [placed, active]);

	useEffect(() => {
		if (placed) listRef.current?.focus({ preventScroll: true });
	}, [placed]);

	const pick = (index: number) => {
		const item = items[index];
		if (!item || item.disabled) return;
		close(true);
		if (item.value !== value) onChange(item.value);
	};

	const move = (from: number, step: number) => {
		for (let index = from + step, tries = 0; tries < items.length; index += step, tries += 1) {
			const wrapped = (index + items.length) % items.length;
			if (!items[wrapped]?.disabled) return wrapped;
		}
		return from;
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		event.stopPropagation();
		if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
			pointed.current = false;
			setLit(true);
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			close(true);
		} else if (event.key === 'Tab') {
			close(false);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			setActive((index) => move(index, event.key === 'ArrowDown' ? 1 : -1));
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			setActive(event.key === 'Home' ? move(-1, 1) : move(items.length, -1));
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			pick(active);
		}
	};

	const described = items.some((item) => item.description);

	return (
		<span className={`inline-flex ${className}`}>
			<button
				ref={buttonRef}
				type="button"
				aria-label={label}
				data-tip={open ? undefined : label}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				onClick={(event) => {
					if (open) close(false);
					else show(event.detail === 0);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
						event.preventDefault();
						show(true);
					}
				}}
				className={`text-ink-2 hover:bg-surface hover:text-ink aria-expanded:bg-surface aria-expanded:text-ink grid h-10 min-w-10 place-items-center rounded-sm transition-colors duration-150 ${buttonClassName}`}
			>
				{children}
			</button>
			{open &&
				createPortal(
					<div
						ref={popoverRef}
						data-media={media ?? undefined}
						data-down={place?.down ?? true}
						className={`menu-in bg-bg text-ink fixed z-50 flex flex-col overflow-hidden rounded-md shadow-[0_0_0_1px_var(--line-2),0_18px_44px_-14px_rgb(0_0_0/0.4)] ${
							described
								? 'w-[min(18rem,calc(100vw-16px))]'
								: 'max-w-[min(420px,calc(100vw-16px))] min-w-44'
						}`}
						style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }}
					>
						{title && (
							<div
								className="text-caption text-muted border-line flex-none border-b px-3.5 pt-2.5 pb-2 font-medium"
								aria-hidden="true"
							>
								{title}
							</div>
						)}
						{header && <div className="border-line flex-none border-b px-4 pt-2.5 pb-2.5">{header}</div>}
						<div
							ref={listRef}
							id={menuId}
							role="menu"
							tabIndex={-1}
							aria-label={label}
							onKeyDown={onKeyDown}
							className="relative grid min-h-0 content-start overflow-x-hidden overflow-y-auto overscroll-contain p-1 outline-none"
							style={place ? { maxHeight: place.maxHeight } : undefined}
						>
							{items.map((item, index) => (
								<div
									key={item.value}
									role="menuitemradio"
									aria-checked={index === selected}
									aria-disabled={item.disabled || undefined}
									onPointerMove={() => {
										if (item.disabled) return;
										pointed.current = true;
										setLit(true);
										if (index !== active) setActive(index);
									}}
									onClick={() => {
										pick(index);
									}}
									className={`text-ui grid min-h-9 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-sm px-2.5 transition-colors duration-100 ${
										item.description ? 'py-2' : 'py-1.5'
									} ${item.disabled ? 'text-muted cursor-not-allowed opacity-55' : 'cursor-pointer'} ${
										lit && index === active && !item.disabled ? 'bg-surface-2' : ''
									} ${item.divider ? 'after:bg-line relative mb-[9px] after:absolute after:inset-x-2.5 after:-bottom-[5px] after:h-px' : ''}`}
								>
									<span className="grid place-items-center self-start pt-[0.2rem]">
										{index === selected && (
											<Check
												size={15}
												strokeWidth={2.4}
												className="text-ed-text"
												aria-hidden="true"
											/>
										)}
									</span>
									<span className="flex min-w-0 items-center gap-2.5">
										{item.leading && (
											<span className="grid flex-none place-items-center">{item.leading}</span>
										)}
										<span className="grid min-w-0 flex-1 gap-0.5">
											<span className="leading-snug [overflow-wrap:anywhere]">{item.label}</span>
											{item.description && (
												<span className="text-caption text-muted tabular truncate">
													{item.description}
												</span>
											)}
										</span>
										{item.detail && (
											<span className="text-muted text-small flex-none pl-3 whitespace-nowrap">
												{item.detail}
											</span>
										)}
									</span>
								</div>
							))}
						</div>
					</div>,
					layerOf(buttonRef.current),
				)}
		</span>
	);
}

/**
 * Height of a list showing its first `rows` choices and half the next one, so it shows there is
 * more; no limit when it holds no more than that.
 */
function rowsHeight(list: HTMLElement, rows: number | undefined): number {
	if (rows === undefined) return Infinity;
	const items = list.querySelectorAll<HTMLElement>('[role=menuitemradio]');
	const next = items[rows];
	if (!next) return Infinity;
	return next.offsetTop + next.offsetHeight / 2;
}
