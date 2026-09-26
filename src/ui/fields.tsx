import { Lock } from 'lucide-react';
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { formatPreciseTime, parseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { Dropdown, type DropdownOption } from './Dropdown';

const FIELD =
	'h-10 w-full rounded-xs border border-line-2 bg-bg font-mono text-small text-ink transition-colors hover:border-muted';

/** A label and its control on one row: the label reads left, the value sits right. */
export function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-3">
			<label htmlFor={htmlFor} className="text-ui text-ink-2">
				{label}
			</label>
			{children}
		</div>
	);
}

export type SelectOption<T extends string> = DropdownOption<T>;

/** A choice in a panel: fills its column, named by the label of its row. */
export function Select<T extends string>({
	id,
	label = '',
	value,
	options,
	onChange,
}: {
	id?: string;
	label?: string;
	value: T;
	options: SelectOption<T>[];
	onChange: (value: T) => void;
}) {
	return <Dropdown id={id} label={label} value={value} options={options} onChange={onChange} />;
}

/**
 * Whole-number input with a unit. Edits are applied on Enter or when leaving the field, so typing
 * `1920` doesn't go through `1`, `19` and `192` on the way.
 */
export function NumberField({
	id,
	value,
	unit,
	min,
	max,
	onCommit,
}: {
	id?: string;
	value: number;
	unit?: string;
	min: number;
	max: number;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const commitDraft = () => {
		if (draft === null) return;
		const parsed = Number.parseInt(draft, 10);
		setDraft(null);
		if (Number.isFinite(parsed)) onCommit(Math.min(max, Math.max(min, parsed)));
	};
	return (
		<span className="relative block">
			<input
				id={id}
				type="text"
				inputMode="numeric"
				value={draft ?? String(value)}
				onChange={(event) => {
					setDraft(event.target.value.replace(/[^\d]/g, ''));
				}}
				onBlur={commitDraft}
				onKeyDown={(event) => {
					if (event.key === 'Enter') commitDraft();
					if (event.key === 'Escape') setDraft(null);
				}}
				className={`${FIELD} cursor-text px-2.5 ${unit ? 'pr-8' : ''}`}
			/>
			{unit && (
				<span className="text-caption text-muted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono">
					{unit}
				</span>
			)}
		</span>
	);
}

/** Free text with its label above, for names and titles that need the full width. */
export function TextField({
	label,
	value,
	placeholder,
	onChange,
}: {
	label: string;
	value: string;
	placeholder?: string;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-ui text-ink-2">
				{label}
			</label>
			<input
				id={id}
				type="text"
				value={value}
				placeholder={placeholder}
				onChange={(event) => {
					onChange(event.target.value);
				}}
				className="border-line-2 bg-bg text-ui text-ink hover:border-muted placeholder:text-muted h-8 w-full cursor-text rounded-xs border px-2.5 transition-colors"
			/>
		</div>
	);
}

/**
 * Time input in minutes, seconds and milliseconds. Accepts what people type: `1:04.25`, `64.25`,
 * `64,25`. Applied on Enter or when leaving the field; anything that isn't a time is discarded.
 */
export function TimeField({
	id,
	value,
	min,
	max,
	onCommit,
}: {
	id?: string;
	value: number;
	min: number;
	max: number;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const commitDraft = () => {
		if (draft === null) return;
		const parsed = parseTime(draft);
		setDraft(null);
		if (parsed !== null) onCommit(Math.min(max, Math.max(min, parsed)));
	};
	return (
		<input
			id={id}
			type="text"
			inputMode="decimal"
			spellCheck={false}
			value={draft ?? formatPreciseTime(value)}
			onChange={(event) => {
				setDraft(event.target.value);
			}}
			onBlur={commitDraft}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commitDraft();
				if (event.key === 'Escape') setDraft(null);
			}}
			className={`${FIELD} tabular cursor-text px-2.5`}
		/>
	);
}

/**
 * Range slider with its value. `onChange` fires while dragging, `onEnd` once released, so a drag
 * can be previewed live and recorded as a single undo step. Double click resets to `defaultValue`.
 */
export function Slider({
	label,
	value,
	min,
	max,
	step = 1,
	defaultValue = 0,
	format = (v) => (v > 0 ? `+${v}` : String(v)),
	track,
	hint,
	onChange,
	onEnd,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	/** The neutral value: double-click returns to it, and the filled part of the track starts there. */
	defaultValue?: number;
	format?: (value: number) => string;
	/** A gradient showing what the setting does, in place of the filled track. */
	track?: string;
	hint?: ReactNode;
	onChange: (value: number) => void;
	onEnd: () => void;
}) {
	const id = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [draft, setDraft] = useState<string | null>(null);
	const at = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
	const low = Math.min(at(defaultValue), at(value));
	const high = Math.max(at(defaultValue), at(value));
	const background =
		track ??
		`linear-gradient(90deg, var(--track-base) ${low}%, var(--ed) ${low}% ${high}%, var(--track-base) ${high}%)`;
	// Pseudo-elements can't be styled inline: the track reads a CSS variable.
	useLayoutEffect(() => {
		inputRef.current?.style.setProperty('--track', background);
	}, [background]);
	const commit = () => {
		if (draft === null) return;
		const typed = Number.parseFloat(draft.replace(',', '.').replace(/[^\d.+-]/g, ''));
		setDraft(null);
		if (Number.isNaN(typed)) return;
		onChange(Math.min(max, Math.max(min, Math.round(typed / step) * step)));
		onEnd();
	};
	return (
		<div className="grid gap-1.5">
			<div className="flex items-center justify-between gap-3">
				<label htmlFor={id} className="text-ui text-ink-2">
					{label}
				</label>
				<input
					aria-label={m.slider_value({ label })}
					value={draft ?? format(value)}
					inputMode="decimal"
					onFocus={(event) => {
						setDraft(format(value));
						event.target.select();
					}}
					onChange={(event) => {
						setDraft(event.target.value);
					}}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === 'Enter') event.currentTarget.blur();
						if (event.key === 'Escape') {
							setDraft(null);
							event.currentTarget.blur();
						}
					}}
					className="tabular hover:bg-surface focus:bg-bg focus:shadow-[inset_0_0_0_1px_var(--line-2)] w-20 rounded-xs bg-transparent px-1.5 py-0.5 text-right font-mono text-small outline-none transition-colors"
				/>
			</div>
			<input
				ref={inputRef}
				id={id}
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => {
					onChange(Number(event.target.value));
				}}
				// Keyboard steps stay one undo step until the slider loses focus.
				onPointerUp={onEnd}
				onBlur={onEnd}
				onDoubleClick={() => {
					onChange(defaultValue);
					onEnd();
				}}
				className="slider h-6 w-full cursor-pointer touch-pan-y appearance-none bg-transparent"
			/>
			{hint && <p className="text-small text-muted -mt-0.5">{hint}</p>}
		</div>
	);
}

/** A list of mutually exclusive choices, each with an optional technical detail on the right. */
export function OptionList<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	/** `reason` says why a disabled choice can't be picked, on hover. */
	options: { value: T; label: string; detail?: string; disabled?: boolean; reason?: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="-mx-2.5 grid gap-0.5">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					role="radio"
					aria-checked={option.value === value}
					disabled={option.disabled}
					title={option.disabled ? option.reason : undefined}
					onClick={() => {
						onChange(option.value);
					}}
					className="enabled:hover:bg-surface group grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 rounded-xs px-2.5 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45"
				>
					<span className="size-4 rounded-full shadow-[inset_0_0_0_1.5px_var(--line-2)] group-aria-checked:shadow-[inset_0_0_0_5px_var(--ed)]" />
					<span className="text-body">{option.label}</span>
					<span className="text-small text-muted flex items-center gap-1.5 font-mono">
						{option.disabled && option.reason && <Lock size={12} aria-hidden="true" />}
						{option.detail}
					</span>
				</button>
			))}
		</div>
	);
}
