import { cn } from "../cn.ts";

export type SpinnerProps = {
	label: string;
	size?: number;
	className?: string;
};

/** The V monogram traced as two converging strokes, used as the loading mark. */
export function Spinner({ label, size = 20, className }: SpinnerProps) {
	return (
		<svg
			role="img"
			aria-label={label}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			className={cn("animate-spin text-[var(--accent)]", className)}
		>
			<circle
				cx="12"
				cy="12"
				r="9"
				className="stroke-current opacity-20"
				strokeWidth="2.5"
				fill="none"
			/>
			<path
				d="M12 3 A9 9 0 0 1 21 12"
				className="stroke-current"
				strokeWidth="2.5"
				strokeLinecap="round"
				fill="none"
			/>
		</svg>
	);
}
