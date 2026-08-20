import type { ReactNode } from "react";
import { cn } from "../cn.ts";

export type FieldProps = {
	label: string;
	children: ReactNode;
	hint?: string;
	error?: string;
	htmlFor?: string;
	className?: string;
};

export function Field({ label, children, hint, error, htmlFor, className }: FieldProps) {
	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<label htmlFor={htmlFor} className="text-xs text-[var(--text-muted)]">
				{label}
			</label>
			{children}
			{error !== undefined ? (
				<p role="alert" className="text-xs text-[var(--danger)]">
					{error}
				</p>
			) : (
				hint !== undefined && <p className="text-xs text-[var(--text-subtle)]">{hint}</p>
			)}
		</div>
	);
}
