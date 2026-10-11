import { Check, Lock, type LucideIcon, Search } from 'lucide-react';
import {
	type CSSProperties,
	Fragment,
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import { m } from '@/paraglide/messages.js';
import { layerOf } from './layer';
import { placeList } from './place';
import { searchable } from './SearchField';
import { usePopover } from './use-popover';

/** Lists this long get a search field at their top. */
const SEARCH_FROM = 12;

export interface DropdownOption<T extends string> {
	value: T;
	label: string;
	/** Shown dimmed after the label, such as a file extension. */
	detail?: string;
	/** A small picture before the label, such as a logo. */
	leading?: ReactNode;
	disabled?: boolean;
	/** Why the option can't be picked: a tooltip on its lock. */
	reason?: string;
	/** Heading of the options it starts, when it differs from the option before. */
	group?: string;
	/** Style of the label, such as a font to show it in. */
	labelStyle?: CSSProperties;
}

/**
 * A choice among options, drawn by the app rather than the system so it looks the same everywhere
 * and follows the theme and the editor's colour. The list opens under the button, or above it
 * near the bottom of the window, and never leaves the window.
 *
 * Keyboard: arrows, Home and End move, Enter or Space picks, Escape closes, letters jump to the
 * next option starting with them.
 */
export function Dropdown<T extends string>({
	id,
	label,
	value,
	options,
	onChange,
	icon: Icon,
	variant = 'field',
	className = '',
	disabled = false,
}: {
	id?: string;
	/** Announced name of the choice, also its tooltip on compact buttons. A field may be named by its `<label for>` instead. */
	label: string;
	value: T;
	options: DropdownOption<T>[];
	onChange: (value: T) => void;
	icon?: LucideIcon;
	/** `field` fills its column like an input; `compact` fits its label, as in the player. */
	variant?: 'field' | 'compact';
	className?: string;
	disabled?: boolean;
}) {
	const [active, setActive] = useState(-1);
	const popover = usePopover((button, list) =>
		placeList(button.getBoundingClientRect(), { width: list.scrollWidth, height: list.scrollHeight }),
	);
	const { open, place, media, buttonRef, popoverRef: listRef, close } = popover;
	const listId = useId();
	const typed = useRef({ text: '', at: 0 });
	const searchRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState('');
	const selected = options.findIndex((option) => option.value === value);
	const current = options[selected];
	const withSearch = options.length >= SEARCH_FROM;
	// The options the search leaves, by their place in `options`.
	const words = searchable(query).split(/\s+/).filter(Boolean);
	const visible = options
		.map((_, index) => index)
		.filter((index) => {
			const option = options[index];
			if (!option || words.length === 0) return true;
			const text = searchable(`${option.label} ${option.detail ?? ''}`);
			return words.every((word) => text.includes(word));
		});

	const show = () => {
		if (disabled) return;
		setActive(selected >= 0 ? selected : options.findIndex((option) => !option.disabled));
		setQuery('');
		popover.show();
	};

	// Hidden while measured, the list can take the focus only once placed.
	const placed = place !== null;
	useEffect(() => {
		if (!placed) return;
		if (searchRef.current) searchRef.current.focus({ preventScroll: true });
		else listRef.current?.focus({ preventScroll: true });
	}, [placed]);

	// The active option stays in view while moving with the keyboard.
	useEffect(() => {
		if (!open || active < 0) return;
		listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	}, [open, active]);

	const pick = (index: number) => {
		const option = options[index];
		if (!option || option.disabled) return;
		close(true);
		if (option.value !== value) onChange(option.value);
	};

	// Moves among the options shown, skipping those that can't be picked.
	const move = (from: number, step: number) => {
		const count = visible.length;
		if (count === 0) return -1;
		const at = visible.indexOf(from);
		let position = at === -1 ? (step > 0 ? -1 : count) : at;
		for (let tries = 0; tries < count; tries += 1) {
			position = (position + step + count) % count;
			const index = visible[position] ?? -1;
			if (!options[index]?.disabled) return index;
		}
		return from;
	};

	const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			show();
		}
	};

	const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		// Keys stay in the list: Space here doesn't also play the video.
		event.stopPropagation();
		if (event.key === 'Escape') {
			event.preventDefault();
			close(true);
		} else if (event.key === 'Tab') {
			close(false);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			setActive((index) => move(index, event.key === 'ArrowDown' ? 1 : -1));
		} else if (event.key === 'Home' || event.key === 'End') {
			if (withSearch) return;
			event.preventDefault();
			setActive(event.key === 'Home' ? move(-1, 1) : move(-2, -1));
		} else if (event.key === 'Enter' || (event.key === ' ' && !withSearch)) {
			event.preventDefault();
			pick(active);
		} else if (!withSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
			const now = performance.now();
			typed.current = {
				text:
					now - typed.current.at < 700
						? typed.current.text + event.key.toLowerCase()
						: event.key.toLowerCase(),
				at: now,
			};
			const { text } = typed.current;
			const order = options.map((_, index) => (active + 1 + index) % options.length);
			const found = order.find(
				(index) => !options[index]?.disabled && options[index]?.label.toLowerCase().startsWith(text),
			);
			if (found !== undefined) setActive(found);
		}
	};

	const compact = variant === 'compact';
	const trigger: ReactNode = (
		<button
			ref={buttonRef}
			id={id}
			type="button"
			disabled={disabled}
			aria-label={compact ? label : undefined}
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-controls={open ? listId : undefined}
			title={compact ? label : undefined}
			onClick={() => {
				if (open) close(false);
				else show();
			}}
			onKeyDown={onButtonKeyDown}
			className={`group/dropdown relative flex min-w-0 items-center gap-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
				compact
					? 'text-ink-2 enabled:hover:text-ink enabled:hover:bg-surface aria-expanded:bg-surface aria-expanded:text-ink h-8 max-w-60 rounded-sm pr-7 pl-2 shadow-[inset_0_0_0_1px_var(--line-2)]'
					: 'border-field bg-bg text-ink enabled:hover:border-muted aria-expanded:border-muted h-8 w-full rounded-xs border pr-7 pl-2.5 text-small'
			} ${className}`}
		>
			{Icon && <Icon size={15} aria-hidden="true" className="flex-none" />}
			{current?.leading}
			<span className={`truncate ${compact ? 'text-ui' : ''}`}>{current?.label ?? ''}</span>
			<span
				className="border-muted pointer-events-none absolute top-1/2 right-3 size-1.5 -translate-y-[70%] rotate-45 border-r-[1.5px] border-b-[1.5px] transition-transform group-aria-expanded/dropdown:translate-y-[-20%] group-aria-expanded/dropdown:rotate-[225deg]"
				aria-hidden="true"
			/>
		</button>
	);

	return (
		<>
			{trigger}
			{open &&
				createPortal(
					<div
						ref={listRef}
						id={listId}
						role="listbox"
						tabIndex={-1}
						aria-label={label || undefined}
						aria-labelledby={!label && id ? id : undefined}
						aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
						data-media={media ?? undefined}
						onKeyDown={onListKeyDown}
						data-down={place?.down ?? true}
						className="menu-in bg-bg text-ink fixed z-50 grid max-w-[min(420px,calc(100vw-16px))] content-start gap-px overflow-y-auto overscroll-contain rounded-sm p-1 shadow-[0_0_0_1px_var(--line-2),0_16px_40px_-12px_rgb(0_0_0/0.35)] outline-none"
						style={
							place
								? {
										top: place.top,
										left: place.left,
										minWidth: place.minWidth,
										maxHeight: place.maxHeight,
									}
								: { top: 0, left: 0, visibility: 'hidden' }
						}
					>
						{withSearch && (
							<div className="bg-bg sticky -top-1 z-10 -mx-1 -mt-1 mb-1 border-b border-(--line) p-1">
								<div className="relative">
									<Search
										className="text-muted pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
										aria-hidden="true"
									/>
									<input
										ref={searchRef}
										type="search"
										value={query}
										aria-label={label || undefined}
										aria-controls={listId}
										aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
										placeholder={m.search_list()}
										onChange={(event) => {
											const next = event.target.value;
											setQuery(next);
											const nextWords = searchable(next).split(/\s+/).filter(Boolean);
											const first = options.findIndex(
												(option) =>
													!option.disabled &&
													nextWords.every((word) =>
														searchable(`${option.label} ${option.detail ?? ''}`).includes(
															word,
														),
													),
											);
											setActive(first);
										}}
										className="bg-surface text-ui h-8 w-full rounded-xs pr-2 pl-7 outline-none [&::-webkit-search-cancel-button]:hidden"
									/>
								</div>
							</div>
						)}
						{visible.length === 0 && (
							<p className="text-small text-muted px-2 py-1.5">{m.search_nothing()}</p>
						)}
						{visible.map((index, position) => {
							const option = options[index];
							if (!option) return null;
							const before = options[visible[position - 1] ?? -1];
							const heading = option.group && option.group !== before?.group ? option.group : null;
							return (
								<Fragment key={option.value}>
									{heading && (
										<div
											role="presentation"
											className="text-caption text-muted px-2 pt-2 pb-1 font-medium first:pt-1"
										>
											{heading}
										</div>
									)}
									<div
										id={`${listId}-${index}`}
										data-index={index}
										role="option"
										aria-selected={index === selected}
										aria-disabled={option.disabled || undefined}
										title={option.disabled ? option.reason : undefined}
										onPointerMove={() => {
											if (!option.disabled && index !== active) setActive(index);
										}}
										onClick={() => {
											pick(index);
										}}
										className={`text-ui flex min-h-8 items-center gap-2 rounded-xs py-1.5 pr-2.5 pl-2 whitespace-nowrap ${
											option.disabled
												? 'text-muted cursor-not-allowed opacity-60'
												: 'cursor-pointer'
										} ${index === active && !option.disabled ? 'bg-surface-2' : ''}`}
									>
										<span className="grid w-4 flex-none place-items-center">
											{index === selected ? (
												<Check
													size={14}
													strokeWidth={2.6}
													className="text-ed-text"
													aria-hidden="true"
												/>
											) : option.disabled && option.reason ? (
												<Lock size={12} aria-hidden="true" />
											) : null}
										</span>
										{option.leading}
										<span
											className={index === selected ? 'font-medium' : ''}
											style={option.labelStyle}
										>
											{option.label}
										</span>
										{option.detail && (
											<span className="text-muted ml-auto pl-4">{option.detail}</span>
										)}
									</div>
								</Fragment>
							);
						})}
					</div>,
					layerOf(buttonRef.current),
				)}
		</>
	);
}
