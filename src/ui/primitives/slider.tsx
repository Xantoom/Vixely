import { useCallback, useRef, useState } from "react";
import {
	Slider as AriaSlider,
	Label,
	SliderOutput,
	SliderThumb,
	SliderTrack,
} from "react-aria-components";
import { cn } from "../cn.ts";
import { NumberInput } from "./number-input.tsx";

export type SliderProps = {
	label: string;
	value: number;
	onChange: (value: number) => void;
	/** Fired on release: the editor uses it to seal the history merge run. */
	onChangeEnd?: (value: number) => void;
	min: number;
	max: number;
	step: number;
	defaultValue: number;
	/** Formats the readout; defaults to the raw number. */
	format?: (value: number) => string;
	disabled?: boolean;
	showInput?: boolean;
	className?: string;
};

/**
 * The most-handled control in the application, so it carries its full
 * behaviour from the first version (design system §4): direct numeric entry,
 * double-click to default, Shift for fine and Alt for coarse steps, a tick on
 * the default value, and a 44px touch target independent of its visual size.
 */
export function Slider({
	label,
	value,
	onChange,
	onChangeEnd,
	min,
	max,
	step,
	defaultValue,
	format,
	disabled = false,
	showInput = true,
	className,
}: SliderProps) {
	const [dragging, setDragging] = useState(false);
	const modifiers = useRef({ shift: false, alt: false });

	const defaultPercent = ((defaultValue - min) / (max - min)) * 100;

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			modifiers.current = { shift: event.shiftKey, alt: event.altKey };
			const direction =
				event.key === "ArrowRight" || event.key === "ArrowUp"
					? 1
					: event.key === "ArrowLeft" || event.key === "ArrowDown"
						? -1
						: 0;
			if (direction === 0) return;
			// Shift refines, Alt coarsens; the default step handles the rest.
			const multiplier = event.shiftKey ? 0.1 : event.altKey ? 10 : 1;
			if (multiplier === 1) return;
			event.preventDefault();
			event.stopPropagation();
			const next = clamp(value + direction * step * multiplier, min, max);
			onChange(round(next, step));
			onChangeEnd?.(round(next, step));
		},
		[value, step, min, max, onChange, onChangeEnd],
	);

	const resetToDefault = useCallback(() => {
		if (disabled) return;
		onChange(defaultValue);
		onChangeEnd?.(defaultValue);
	}, [defaultValue, disabled, onChange, onChangeEnd]);

	return (
		<AriaSlider
			value={value}
			onChange={onChange}
			onChangeEnd={(next) => {
				setDragging(false);
				onChangeEnd?.(next as number);
			}}
			minValue={min}
			maxValue={max}
			step={step}
			isDisabled={disabled}
			className={cn("flex flex-col gap-1", className)}
		>
			<div className="flex items-center justify-between gap-2">
				<Label className="text-xs text-[var(--text-muted)] select-none">{label}</Label>
				{showInput ? (
					<NumberInput
						aria-label={label}
						value={value}
						onChange={(next) => {
							onChange(next);
							onChangeEnd?.(next);
						}}
						min={min}
						max={max}
						step={step}
						disabled={disabled}
						className="w-16"
					/>
				) : (
					<SliderOutput className="tabular text-xs text-[var(--text-muted)]">
						{({ state }) => format?.(value) ?? state.getThumbValueLabel(0)}
					</SliderOutput>
				)}
			</div>

			{/* Capture phase: react-aria stops arrow keys from bubbling, so the
			    modifier steps have to be intercepted before it handles them. */}
			<div
				className="contents"
				onDoubleClick={resetToDefault}
				onKeyDownCapture={handleKeyDown}
				role="presentation"
			>
				<SliderTrack className="relative flex h-11 w-full touch-none items-center">
					{({ state }) => (
						<>
							<div className="absolute inset-x-0 h-1 rounded-full bg-[var(--bg-active)]" />
							<div
								className="absolute h-1 rounded-full bg-[var(--accent)]"
								style={{
									left: `${Math.min(state.getThumbPercent(0), defaultPercent / 100) * 100}%`,
									width: `${Math.abs(state.getThumbPercent(0) - defaultPercent / 100) * 100}%`,
								}}
							/>
							<div
								aria-hidden
								className="absolute h-2 w-px bg-[var(--border-strong)]"
								style={{ left: `${defaultPercent}%` }}
							/>
							<SliderThumb
								className={cn(
									"top-1/2 size-4 rounded-full border-2 border-[var(--accent)] bg-[var(--bg-raised)]",
									"transition-[transform,box-shadow] duration-[var(--duration-micro)] ease-out",
									"dragging:scale-110 outline-none",
									"focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2",
									dragging && "scale-110",
								)}
								onHoverStart={() => undefined}
							/>
						</>
					)}
				</SliderTrack>
			</div>
		</AriaSlider>
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function round(value: number, step: number): number {
	const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
	return Number(value.toFixed(decimals));
}
