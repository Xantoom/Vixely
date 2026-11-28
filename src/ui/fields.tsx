import { Lock, RotateCcw } from 'lucide-react';
import { type ReactNode, useId, useLayoutEffect, useRef } from 'react';
import {
	type Choice,
	DurationField,
	NumberField as DsNumberField,
	Select as DsSelect,
	Switch as DsSwitch,
	TextField as DsTextField,
	type SelectProps,
} from 'xantoom-design/react';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

/** A label and its control on one row: the label reads left, the value sits right. */
export function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-3">
			{/* The id lets a design-system Select read "label, choice". */}
			<label htmlFor={htmlFor} id={htmlFor ? `${htmlFor}-label` : undefined} className="text-ui text-fg-muted">
				{label}
			</label>
			{children}
		</div>
	);
}

export type SelectOption<T extends string> = Choice<T>;

/**
 * The design system's Select, adapted: `label` is its accessible name (a FieldRow's label names it through `id`
 * otherwise), and long lists get the app's search.
 */
export function Select<T extends string>({
	label,
	...props
}: Omit<SelectProps<T>, 'label' | 'hint' | 'error' | 'required' | 'search'> & { label?: string }) {
	return (
		<DsSelect
			aria-label={label || undefined}
			search={{ label: m.search_list(), empty: m.search_nothing() }}
			{...props}
		/>
	);
}

/** A whole number with a unit, applied on Enter or when leaving the field (the design system's NumberField). */
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
	return (
		<DsNumberField
			id={id}
			value={value}
			unit={unit}
			min={min}
			max={max}
			locale={getLocale()}
			// Sizes and rates read as one number: 1920, never 1 920.
			format={{ useGrouping: false }}
			// It fills its column, beside a label or in a narrow cell.
			className="w-full"
			onChange={onCommit}
		/>
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
	return (
		<DsTextField
			label={label}
			value={value}
			placeholder={placeholder}
			onChange={(event) => {
				onChange(event.target.value);
			}}
		/>
	);
}

/**
 * A time to the millisecond (m:ss.mmm): typed as people write it (`1:04.25`, `64.25`, `64,25`), applied on Enter or
 * when leaving the field. The design system's DurationField.
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
	return (
		<DurationField
			id={id}
			value={value}
			min={min}
			max={max}
			step={0.001}
			locale={getLocale()}
			onChange={onCommit}
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
	resettable = false,
	hideLabel = false,
	onChange,
	onEnd,
}: {
	label: string;
	/** Under a title that already names it: the label is left to assistive tech. */
	hideLabel?: boolean;
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
	/** Keeps a button beside the value that returns to the neutral value, shown once moved away from it. */
	resettable?: boolean;
	onChange: (value: number) => void;
	onEnd: () => void;
}) {
	const id = useId();
	const inputRef = useRef<HTMLInputElement>(null);
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
	return (
		<div className="grid gap-1.5">
			<div className="flex items-center justify-between gap-2">
				<label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-ui text-fg-muted min-w-0 flex-1 truncate'}>
					{label}
				</label>
				{resettable && (
					// Before the value, inside the panel; it fades in once the setting has moved.
					<button
						type="button"
						aria-label={m.reset()}
						data-tip={m.reset()}
						disabled={value === defaultValue}
						onClick={() => {
							onChange(defaultValue);
							onEnd();
						}}
						className="text-fg-faint enabled:hover:bg-sunken enabled:hover:text-fg x-touch-target relative -my-1 ml-auto grid size-6 flex-none cursor-pointer place-items-center rounded-sm transition-[opacity,color,background-color] duration-200 disabled:pointer-events-none disabled:opacity-0"
					>
						<RotateCcw className="size-3.5" aria-hidden="true" />
					</button>
				)}
				<output
					className={`x-tabular text-small text-fg flex-none text-right ${resettable ? '' : 'ml-auto'}`}
					aria-label={m.slider_value({ label })}
				>
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
				className="slider h-6 w-full cursor-pointer touch-pan-y appearance-none bg-transparent"
			/>
			{hint && <p className="text-small text-fg-faint -mt-0.5">{hint}</p>}
		</div>
	);
}

/** A list of mutually exclusive choices (native radios), each with an optional technical detail on the right. */
export function OptionList<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	/**
	 * `description` says what the choice does, under its label; `reason` says why a disabled
	 * choice can't be picked, in its tooltip.
	 */
	options: { value: T; label: string; description?: string; detail?: string; disabled?: boolean; reason?: string }[];
	onChange: (value: T) => void;
}) {
	const name = useId();
	return (
		<fieldset className="-mx-2.5 grid gap-0.5">
			<legend className="sr-only">{label}</legend>
			{options.map((option) => (
				<label
					key={option.value}
					data-tip={option.disabled ? option.reason : undefined}
					className="has-enabled:hover:bg-sunken grid cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 rounded-sm px-2.5 py-2 has-disabled:cursor-not-allowed has-disabled:opacity-45"
				>
					<input
						type="radio"
						className="x-radio translate-y-0.5 self-start"
						name={name}
						value={option.value}
						checked={option.value === value}
						disabled={option.disabled}
						onChange={() => {
							onChange(option.value);
						}}
					/>
					<span className="text-body">{option.label}</span>
					<span className="text-small text-fg-faint flex items-center gap-1.5">
						{option.disabled && option.reason && <Lock size={12} aria-hidden="true" />}
						{option.detail}
					</span>
					{option.description && (
						<span className="text-small text-fg-faint col-start-2 col-end-4 text-pretty">
							{option.description}
						</span>
					)}
				</label>
			))}
		</fieldset>
	);
}

/**
 * An on and off setting (the design system's Switch). Beside what it names already, as at the start of a list's
 * line, `hideLabel` leaves the label to assistive tech; `title` says why it can't be changed, in a tooltip.
 */
export function Switch({
	label,
	checked,
	onChange,
	hideLabel = false,
	disabled = false,
	title,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	hideLabel?: boolean;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<DsSwitch
			label={hideLabel ? undefined : label}
			aria-label={hideLabel ? label : undefined}
			checked={checked}
			disabled={disabled}
			data-tip={title}
			onChange={onChange}
		/>
	);
}
