import type { InputHTMLAttributes } from 'react';

/**
 * A checkbox drawn by the app: a rounded box that fills with the editor's colour, its tick drawing
 * itself in. The real input stays underneath for the keyboard and assistive technologies.
 */
export function Checkbox({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
	return (
		<span className={`relative grid size-[1.15rem] flex-none place-items-center ${className}`}>
			<input
				type="checkbox"
				className="peer border-line-2 bg-bg enabled:hover:border-muted checked:border-ed checked:bg-ed focus-visible:outline-ed-text ease-spring size-full appearance-none rounded-[0.35rem] border-[1.5px] transition-[background-color,border-color,transform] duration-150 enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
				{...props}
			/>
			<svg
				viewBox="0 0 16 16"
				aria-hidden="true"
				className="text-ed-ink pointer-events-none absolute size-3 [stroke-dasharray:16] [stroke-dashoffset:16] transition-[stroke-dashoffset] duration-200 peer-checked:[stroke-dashoffset:0]"
			>
				<path
					d="M3.5 8.5l3 3 6-7"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	);
}
