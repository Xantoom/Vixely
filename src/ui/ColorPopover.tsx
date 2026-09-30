import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import { m } from '@/paraglide/messages.js';
import { layerOf } from './layer';
import { type Place, placeList } from './place';

interface Hsv {
	h: number;
	s: number;
	v: number;
}

function hexToHsv(hex: string): Hsv {
	const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '000000';
	const r = Number.parseInt(value.slice(0, 2), 16) / 255;
	const g = Number.parseInt(value.slice(2, 4), 16) / 255;
	const b = Number.parseInt(value.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	let h = 0;
	if (delta > 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
	}
	return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
	const channel = (n: number) => {
		const k = (n + h / 60) % 6;
		const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
		return Math.round(value * 255)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${channel(5)}${channel(3)}${channel(1)}`;
}

/** Follows a drag over an area, giving where the pointer is as fractions of its width and height. */
function useArea(onMove: (x: number, y: number) => void) {
	const ref = useRef<HTMLDivElement>(null);
	const move = (event: ReactPointerEvent<HTMLDivElement>) => {
		const rect = ref.current?.getBoundingClientRect();
		if (!rect) return;
		onMove(
			Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
			Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
		);
	};
	return {
		ref,
		onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			move(event);
		},
		onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event);
		},
	};
}

/**
 * Any colour: saturation and brightness on a square, hue on a bar, and the hexadecimal code to
 * type or paste. Changes apply as they are made.
 */
function ColorChooser({ value, onChange }: { value: string; onChange: (color: string) => void }) {
	const [hsv, setHsv] = useState(() => hexToHsv(value));
	const [draft, setDraft] = useState<string | null>(null);
	// Picking black or white keeps the hue chosen, which the hex code alone would lose.
	useEffect(() => {
		if (hsvToHex(hsv) !== value.toLowerCase()) setHsv(hexToHsv(value));
		// Only an outside change resets the chooser.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [value]);
	const update = (next: Hsv) => {
		setHsv(next);
		onChange(hsvToHex(next));
	};
	const square = useArea((x, y) => {
		update({ ...hsv, s: x, v: 1 - y });
	});
	const hue = useArea((x) => {
		update({ ...hsv, h: x * 359.9 });
	});
	const nudge = (event: ReactKeyboardEvent, change: (step: number) => Hsv | null) => {
		const step =
			event.key === 'ArrowRight' || event.key === 'ArrowUp'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowDown'
					? -1
					: 0;
		if (step === 0) return;
		const next = change(step * (event.shiftKey ? 10 : 1));
		if (!next) return;
		event.preventDefault();
		update(next);
	};
	const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
	return (
		<div className="grid w-56 gap-3">
			<div
				{...square}
				role="slider"
				tabIndex={0}
				aria-label={m.color_shade()}
				aria-valuetext={hsvToHex(hsv)}
				onKeyDown={(event) => {
					nudge(event, (step) =>
						event.key === 'ArrowUp' || event.key === 'ArrowDown'
							? { ...hsv, v: Math.min(1, Math.max(0, hsv.v + step / 100)) }
							: { ...hsv, s: Math.min(1, Math.max(0, hsv.s + step / 100)) },
					);
				}}
				className="relative h-36 cursor-crosshair touch-none rounded-sm"
				style={{
					background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})`,
				}}
			>
				<span
					className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_#fff,0_0_0_3px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(0_0_0/0.2)]"
					style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
				/>
			</div>
			<div
				{...hue}
				role="slider"
				tabIndex={0}
				aria-label={m.color_hue()}
				aria-valuemin={0}
				aria-valuemax={360}
				aria-valuenow={Math.round(hsv.h)}
				onKeyDown={(event) => {
					nudge(event, (step) => ({ ...hsv, h: (hsv.h + step * 3.6 + 360) % 360 }));
				}}
				className="relative h-3.5 cursor-pointer touch-none rounded-full bg-[linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]"
			>
				<span
					className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_#fff,0_0_0_3px_rgb(0_0_0/0.3)]"
					style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }}
				/>
			</div>
			<div className="flex items-center gap-2">
				<span
					className="size-8 flex-none rounded-xs shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
					style={{ background: hsvToHex(hsv) }}
					aria-hidden="true"
				/>
				<input
					aria-label={m.color_hex()}
					spellCheck={false}
					value={draft ?? hsvToHex(hsv)}
					onChange={(event) => {
						setDraft(event.target.value);
						const typed = event.target.value.trim().replace(/^#?/, '#');
						if (/^#[0-9a-f]{6}$/i.test(typed)) update(hexToHsv(typed));
					}}
					onBlur={() => {
						setDraft(null);
					}}
					className="border-line-2 bg-bg text-ink hover:border-muted h-8 min-w-0 flex-1 rounded-xs border px-2.5 text-caption uppercase transition-colors"
				/>
			</div>
		</div>
	);
}

/**
 * A button opening the colour chooser in a small floating panel under it. `children` is the
 * button's face.
 */
export function ColorPopover({
	label,
	value,
	onChange,
	children,
	className = '',
}: {
	label: string;
	value: string;
	onChange: (color: string) => void;
	children: ReactNode;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [place, setPlace] = useState<Place | null>(null);
	const [media, setMedia] = useState<string | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const close = useCallback((focus: boolean) => {
		setOpen(false);
		setPlace(null);
		if (focus) buttonRef.current?.focus();
	}, []);

	const reposition = useCallback(() => {
		const button = buttonRef.current;
		const panel = panelRef.current;
		if (!button || !panel) return;
		setPlace(placeList(button.getBoundingClientRect(), { width: panel.offsetWidth, height: panel.offsetHeight }));
	}, []);

	useLayoutEffect(() => {
		if (open) reposition();
	}, [open, reposition]);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const { target } = event;
			if (!(target instanceof Node)) return;
			if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
			close(false);
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('resize', reposition);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('resize', reposition);
		};
	}, [open, close, reposition]);

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				aria-label={label}
				data-tip={label}
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => {
					if (open) {
						close(false);
						return;
					}
					setMedia(buttonRef.current?.closest('[data-media]')?.getAttribute('data-media') ?? null);
					setOpen(true);
				}}
				className={className}
			>
				{children}
			</button>
			{open &&
				createPortal(
					<div
						ref={panelRef}
						role="dialog"
						aria-label={label}
						data-media={media ?? undefined}
						data-down={place?.down ?? true}
						onKeyDown={(event) => {
							// Keys stay in the chooser (Space doesn't play the video), except Escape which closes it.
							event.stopPropagation();
							if (event.key === 'Escape') close(true);
						}}
						className="menu-in bg-bg text-ink fixed z-50 rounded-md p-3 shadow-[0_0_0_1px_var(--line-2),0_18px_44px_-14px_rgb(0_0_0/0.4)]"
						style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }}
					>
						<ColorChooser value={value} onChange={onChange} />
					</div>,
					layerOf(buttonRef.current),
				)}
		</>
	);
}
