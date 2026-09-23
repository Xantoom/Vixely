import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
import { formatPreciseTime, parseTime } from '@/lib/format';

const FIELD =
	'h-8 w-full rounded-xs border border-line-2 bg-bg font-mono text-[12.5px] text-ink transition-colors hover:border-muted';

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

export interface SelectOption<T extends string> {
	value: T;
	label: string;
	disabled?: boolean;
}

export function Select<T extends string>({
	id,
	value,
	options,
	onChange,
}: {
	id?: string;
	value: T;
	options: SelectOption<T>[];
	onChange: (value: T) => void;
}) {
	return (
		<span className="relative block">
			<select
				id={id}
				value={value}
				onChange={(event) => {
					const next = options.find((option) => option.value === event.target.value);
					if (next) onChange(next.value);
				}}
				className={`${FIELD} appearance-none pr-7 pl-2.5`}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value} disabled={option.disabled}>
						{option.label}
					</option>
				))}
			</select>
			<span
				className="border-muted pointer-events-none absolute top-1/2 right-3 size-1.5 -translate-y-[70%] rotate-45 border-r-[1.5px] border-b-[1.5px]"
				aria-hidden="true"
			/>
		</span>
	);
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
	hint,
	onChange,
	onEnd,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	defaultValue?: number;
	format?: (value: number) => string;
	hint?: ReactNode;
	onChange: (value: number) => void;
	onEnd: () => void;
}) {
	const id = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const fill = ((value - min) / (max - min)) * 100;
	// The track reads the filled share from a CSS variable, since pseudo-elements can't be styled inline.
	useLayoutEffect(() => {
		inputRef.current?.style.setProperty('--fill', `${fill}%`);
	}, [fill]);
	return (
		<div className="grid gap-2">
			<div className="flex items-baseline justify-between gap-3">
				<label htmlFor={id} className="text-ui text-ink-2">
					{label}
				</label>
				<output htmlFor={id} className="tabular font-mono text-[12.5px]">
					{format(value)}
				</output>
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
				className="slider h-5 w-full cursor-pointer appearance-none bg-transparent"
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
	options: { value: T; label: string; detail?: string }[];
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
					onClick={() => {
						onChange(option.value);
					}}
					className="hover:bg-surface group grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-3 rounded-xs px-2.5 py-2 text-left"
				>
					<span className="size-4 rounded-full shadow-[inset_0_0_0_1.5px_var(--line-2)] group-aria-checked:shadow-[inset_0_0_0_5px_var(--ed)]" />
					<span className="text-body">{option.label}</span>
					{option.detail && <span className="text-small text-muted font-mono">{option.detail}</span>}
				</button>
			))}
		</div>
	);
}
