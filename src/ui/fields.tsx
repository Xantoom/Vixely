import { Lock } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import {
	type Choice,
	DurationField,
	NumberField as DsNumberField,
	Select as DsSelect,
	Slider as DsSlider,
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
 * A range setting (the design system's Slider): `onChange` follows the drag, `onEnd` comes once released, so a drag is
 * previewed live and kept as one undo step. Double click returns to `defaultValue`, where the fill starts.
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
	return (
		<DsSlider
			label={label}
			hideLabel={hideLabel}
			value={value}
			min={min}
			max={max}
			step={step}
			neutral={defaultValue}
			format={format}
			track={track}
			hint={hint}
			reset={resettable ? m.reset() : undefined}
			onChange={onChange}
			onCommit={onEnd}
		/>
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
