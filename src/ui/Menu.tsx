import { Check } from 'lucide-react';
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
import { layerOf } from './layer';
import { type Place, placeList } from './place';

export interface MenuItem<T extends string> {
	value: T;
	label: string;
	/** Drawn before the label: a flag, an icon. */
	leading?: ReactNode;
	/** Shown dimmed after the label, such as a codec. */
	detail?: string;
	disabled?: boolean;
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
	/** Which edge of the button the menu lines up with. */
	align?: 'start' | 'end';
	className?: string;
	buttonClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const [place, setPlace] = useState<Place | null>(null);
	const [media, setMedia] = useState<string | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const menuId = useId();
	const selected = items.findIndex((item) => item.value === value);

	const close = useCallback((focus: boolean) => {
		setOpen(false);
		setPlace(null);
		if (focus) buttonRef.current?.focus();
	}, []);

	const show = () => {
		setMedia(buttonRef.current?.closest('[data-media]')?.getAttribute('data-media') ?? null);
		setActive(selected >= 0 ? selected : items.findIndex((item) => !item.disabled));
		setOpen(true);
	};

	const reposition = useCallback(() => {
		const button = buttonRef.current;
		const list = listRef.current;
		if (!button || !list) return;
		setPlace(
			placeList(button.getBoundingClientRect(), { width: list.scrollWidth, height: list.scrollHeight }, align),
		);
	}, [align]);

	useLayoutEffect(() => {
		if (open) reposition();
	}, [open, reposition]);

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
				onClick={() => {
					if (open) close(false);
					else show();
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
						event.preventDefault();
						show();
					}
				}}
				className={`text-ink-2 hover:bg-surface hover:text-ink aria-expanded:bg-surface aria-expanded:text-ink grid h-10 min-w-10 place-items-center rounded-sm transition-colors duration-150 ${buttonClassName}`}
			>
				{children}
			</button>
			{open &&
				createPortal(
					<div
						ref={listRef}
						id={menuId}
						role="menu"
						tabIndex={-1}
						aria-label={label}
						data-media={media ?? undefined}
						data-down={place?.down ?? true}
						onKeyDown={onKeyDown}
						className="menu-in bg-bg text-ink fixed z-50 grid max-w-[min(420px,calc(100vw-16px))] content-start gap-px overflow-y-auto overscroll-contain rounded-md p-1.5 shadow-[0_0_0_1px_var(--line-2),0_18px_44px_-14px_rgb(0_0_0/0.4)] outline-none"
						style={
							place
								? { top: place.top, left: place.left, maxHeight: place.maxHeight }
								: { top: 0, left: 0, visibility: 'hidden' }
						}
					>
						{title && (
							<div className="text-caption text-muted px-2.5 pt-1 pb-1.5 font-medium" aria-hidden="true">
								{title}
							</div>
						)}
						{items.map((item, index) => (
							<div
								key={item.value}
								role="menuitemradio"
								aria-checked={index === selected}
								aria-disabled={item.disabled || undefined}
								onPointerMove={() => {
									if (!item.disabled && index !== active) setActive(index);
								}}
								onClick={() => {
									pick(index);
								}}
								className={`text-ui flex min-h-9 items-center gap-2.5 rounded-sm py-1.5 pr-3 pl-2.5 whitespace-nowrap transition-colors duration-100 ${
									item.disabled ? 'text-muted cursor-not-allowed opacity-55' : 'cursor-pointer'
								} ${index === active && !item.disabled ? 'bg-surface-2' : ''}`}
							>
								{item.leading && (
									<span className="grid flex-none place-items-center">{item.leading}</span>
								)}
								<span className={index === selected ? 'font-semibold' : ''}>{item.label}</span>
								{item.detail && (
									<span className="text-muted ml-auto pl-3 text-small">{item.detail}</span>
								)}
								<span
									className={`grid w-4 flex-none place-items-center ${item.detail ? '' : 'ml-auto pl-3'}`}
								>
									{index === selected && (
										<Check
											size={15}
											strokeWidth={2.6}
											className="text-ed-text"
											aria-hidden="true"
										/>
									)}
								</span>
							</div>
						))}
					</div>,
					layerOf(buttonRef.current),
				)}
		</span>
	);
}
