import { useEffect, type ReactNode } from "react";
import { cn } from "../cn.ts";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type Toast = {
	readonly id: string;
	readonly message: string;
	readonly tone: ToastTone;
	readonly action?: { readonly label: string; readonly onPress: () => void };
	readonly durationMs?: number;
};

const TONES: Record<ToastTone, string> = {
	info: "border-[var(--info)] bg-[var(--info-surface)]",
	success: "border-[var(--success)] bg-[var(--success-surface)]",
	warning: "border-[var(--warning)] bg-[var(--warning-surface)]",
	danger: "border-[var(--danger)] bg-[var(--danger-surface)]",
};

export type ToastRegionProps = {
	toasts: readonly Toast[];
	onDismiss: (id: string) => void;
	label: string;
	dismissLabel: string;
};

/**
 * Announced through a live region: a screen reader user has to learn that an
 * export finished, not only see a card appear.
 */
export function ToastRegion({ toasts, onDismiss, label, dismissLabel }: ToastRegionProps) {
	return (
		<div
			role="region"
			aria-label={label}
			className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
		>
			{toasts.map((toast) => (
				<ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} dismissLabel={dismissLabel} />
			))}
		</div>
	);
}

function ToastCard({
	toast,
	onDismiss,
	dismissLabel,
}: {
	toast: Toast;
	onDismiss: (id: string) => void;
	dismissLabel: string;
}): ReactNode {
	useEffect(() => {
		const duration = toast.durationMs ?? (toast.tone === "danger" ? 12_000 : 6000);
		const timer = setTimeout(() => onDismiss(toast.id), duration);
		return () => clearTimeout(timer);
	}, [toast, onDismiss]);

	return (
		<div
			role="status"
			aria-live={toast.tone === "danger" ? "assertive" : "polite"}
			className={cn(
				"pointer-events-auto flex items-start gap-3 rounded-[var(--radius-container)] border-l-2 border-y border-r",
				"border-y-[var(--border)] border-r-[var(--border)] px-3 py-2 text-sm text-[var(--text)]",
				"shadow-[var(--shadow-overlay)]",
				// Entrance is CSS-driven; a mount effect that sets state would
				// cost a second render for an animation.
				"motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
				TONES[toast.tone],
			)}
		>
			<p className="flex-1">{toast.message}</p>
			{toast.action !== undefined && (
				<button
					type="button"
					onClick={toast.action.onPress}
					className="shrink-0 text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
				>
					{toast.action.label}
				</button>
			)}
			<button
				type="button"
				aria-label={dismissLabel}
				onClick={() => onDismiss(toast.id)}
				className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
			>
				<svg
					aria-hidden
					width="10"
					height="10"
					viewBox="0 0 12 12"
					className="fill-none stroke-current stroke-[1.5]"
				>
					<path d="M2 2 L10 10 M10 2 L2 10" />
				</svg>
			</button>
		</div>
	);
}
