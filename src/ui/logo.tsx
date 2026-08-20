import { cn } from "./cn.ts";

export type LogoProps = {
	size?: number;
	className?: string;
	title?: string;
};

/**
 * The Vixely monogram: two strokes converging to a point, read at once as a
 * V, as a playback chevron and as two tracks merging into one output.
 * Geometric, single colour, legible at 16px.
 */
export function Logo({ size = 24, className, title }: LogoProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 32 32"
			role={title === undefined ? "presentation" : "img"}
			aria-label={title}
			aria-hidden={title === undefined}
			className={cn("shrink-0", className)}
		>
			<path
				d="M5 7 L16 25 L27 7"
				fill="none"
				stroke="currentColor"
				strokeWidth="3.5"
				strokeLinecap="square"
				strokeLinejoin="miter"
			/>
			<path
				d="M11 7 L16 15.5 L21 7"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				opacity="0.45"
			/>
		</svg>
	);
}
