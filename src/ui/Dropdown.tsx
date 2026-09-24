import { Check, Lock, type LucideIcon } from 'lucide-react';
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption<T extends string> {
	value: T;
	label: string;
	/** Shown dimmed after the label, such as a file extension. */
	detail?: string;
	disabled?: boolean;
	/** Why the option can't be picked: a tooltip on its lock. */
	reason?: string;
}

/** Room kept between the list and the edges of the window. */
const EDGE = 8;
const GAP = 4;

interface Place {
	top: number;
	left: number;
	minWidth: number;
	maxHeight: number;
}

/**
 * Where the list goes: under the button when it fits, above it otherwise, whichever side has more
 * room when neither does; its left edge on the button's, moved left if it would leave the window.
 */
function placeList(button: DOMRect, list: { width: number; height: number }): Place {
	const below = window.innerHeight - button.bottom - GAP - EDGE;
	const above = button.top - GAP - EDGE;
	const down = list.height <= below || below >= above;
	const maxHeight = Math.max(120, down ? below : above);
	const height = Math.min(list.height, maxHeight);
	const width = Math.max(list.width, button.width);
	const left = Math.max(EDGE, Math.min(button.left, window.innerWidth - EDGE - width));
	return { top: down ? button.bottom + GAP : button.top - GAP - height, left, minWidth: button.width, maxHeight };
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
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const [place, setPlace] = useState<Place | null>(null);
	const [media, setMedia] = useState<string | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const listId = useId();
	const typed = useRef({ text: '', at: 0 });
	const selected = options.findIndex((option) => option.value === value);
	const current = options[selected];

	const close = useCallback((focus: boolean) => {
		setOpen(false);
		setPlace(null);
		if (focus) buttonRef.current?.focus();
	}, []);

	const show = () => {
		if (disabled) return;
		// The list is drawn outside the editor, so it takes the editor's colour along.
		setMedia(buttonRef.current?.closest('[data-media]')?.getAttribute('data-media') ?? null);
		setActive(selected >= 0 ? selected : options.findIndex((option) => !option.disabled));
		setOpen(true);
	};

	const reposition = useCallback(() => {
		const button = buttonRef.current;
		const list = listRef.current;
		if (!button || !list) return;
		setPlace(placeList(button.getBoundingClientRect(), { width: list.scrollWidth, height: list.scrollHeight }));
	}, []);

	// Measured before painting, so the list never shows in the wrong place first.
	useLayoutEffect(() => {
		if (!open) return;
		reposition();
	}, [open, reposition]);

	// Hidden while measured, the list can take the focus only once placed.
	const placed = place !== null;
	useEffect(() => {
		if (placed) listRef.current?.focus({ preventScroll: true });
	}, [placed]);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const { target } = event;
			if (!(target instanceof Node)) return;
			if (listRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
			close(false);
		};
		// Scrolling the page moves the button: the list follows it, unless it is the list scrolling.
		const onScroll = (event: Event) => {
			if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
			reposition();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', onScroll, true);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', onScroll, true);
		};
	}, [open, close, reposition]);

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

	const move = (from: number, step: number) => {
		for (let index = from + step, tries = 0; tries < options.length; index += step, tries += 1) {
			const wrapped = (index + options.length) % options.length;
			if (!options[wrapped]?.disabled) return wrapped;
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
			event.preventDefault();
			setActive(event.key === 'Home' ? move(-1, 1) : move(options.length, -1));
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			pick(active);
		} else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
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
					: 'border-line-2 bg-bg text-ink enabled:hover:border-muted aria-expanded:border-muted h-8 w-full rounded-xs border pr-7 pl-2.5 font-mono text-[12.5px]'
			} ${className}`}
		>
			{Icon && <Icon size={15} aria-hidden="true" className="flex-none" />}
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
						className="bg-bg text-ink fixed z-50 grid max-w-[min(420px,calc(100vw-16px))] content-start gap-px overflow-y-auto overscroll-contain rounded-sm p-1 shadow-[0_0_0_1px_var(--line-2),0_16px_40px_-12px_rgb(0_0_0/0.35)] outline-none"
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
						{options.map((option, index) => (
							<div
								key={option.value}
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
									option.disabled ? 'text-muted cursor-not-allowed opacity-60' : 'cursor-pointer'
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
								<span className={index === selected ? 'font-medium' : ''}>{option.label}</span>
								{option.detail && (
									<span className="text-muted ml-auto pl-4 font-mono">{option.detail}</span>
								)}
							</div>
						))}
					</div>,
					document.body,
				)}
		</>
	);
}
