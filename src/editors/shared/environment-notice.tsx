import type { EnvironmentLimitation } from "~/core/environment";
import { cn } from "~/ui/cn.ts";
import { useTranslate } from "~/ui/hooks/use-translate.ts";

export type EnvironmentNoticeProps = {
	limitations: readonly EnvironmentLimitation[];
	className?: string;
};

const TONES = {
	blocking: "border-[var(--danger)] bg-[var(--danger-surface)]",
	warning: "border-[var(--warning)] bg-[var(--warning-surface)]",
	info: "border-[var(--info)] bg-[var(--info-surface)]",
} as const;

/**
 * Limits are stated before the work, never after it (plan §10). Icons carry
 * the severity alongside colour, so it is not the only signal.
 */
export function EnvironmentNotice({ limitations, className }: EnvironmentNoticeProps) {
	const t = useTranslate();
	if (limitations.length === 0) return null;

	return (
		<ul className={cn("flex flex-col gap-2", className)}>
			{limitations.map((limitation) => (
				<li
					key={limitation.key}
					className={cn(
						"flex items-start gap-2 rounded-[var(--radius-container)] border-l-2 border-y border-r",
						"border-y-[var(--border)] border-r-[var(--border)] px-3 py-2 text-sm",
						TONES[limitation.severity],
					)}
				>
					<SeverityIcon severity={limitation.severity} />
					<span>{t(limitation.key)}</span>
				</li>
			))}
		</ul>
	);
}

function SeverityIcon({ severity }: { severity: EnvironmentLimitation["severity"] }) {
	return (
		<svg
			aria-hidden
			width="14"
			height="14"
			viewBox="0 0 16 16"
			className="mt-0.5 shrink-0 fill-none stroke-current stroke-[1.4]"
		>
			<circle cx="8" cy="8" r="6.4" />
			{severity === "info" ? <path d="M8 7v4.2M8 4.8v.6" /> : <path d="M8 4.8v4M8 10.8v.6" />}
		</svg>
	);
}
