import type { ReactNode } from 'react';
import { ColorPicker, Popover } from 'xantoom-design/react';
import { m } from '@/paraglide/messages.js';

/**
 * A button of the caller's (`children` is its face) opening the design system's colour picker under it. Keys stay in
 * the picker, so Space does not play the video; Escape still closes it.
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
	return (
		<Popover
			label={label}
			trigger={(props) => (
				<button {...props} type="button" aria-label={label} data-tip={label} className={className}>
					{children}
				</button>
			)}
		>
			<div
				onKeyDown={(event) => {
					if (event.key !== 'Escape') event.stopPropagation();
				}}
			>
				<ColorPicker
					value={value}
					onChange={onChange}
					labels={{ plane: m.color_shade(), hue: m.color_hue(), hex: m.color_hex() }}
				/>
			</div>
		</Popover>
	);
}
