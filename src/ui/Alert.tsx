import { type ReactNode, useEffect, useRef } from 'react';

/**
 * A short message that waits for an answer (a design system dialog), drawn by the app rather than the browser's own
 * `alert()` and `confirm()`: a title, a few words, and the buttons that answer it. Escape and the
 * backdrop dismiss it.
 */
export function Alert({
	title,
	children,
	actions,
	onClose,
	icon,
	media,
}: {
	title: string;
	children: ReactNode;
	/** The answers, the main one last. */
	actions: ReactNode;
	onClose: () => void;
	/** Drawn beside the title: what kind of message it is. */
	icon?: ReactNode;
	/** The editor's colour inside, as `data-media` gives it. */
	media?: string;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = ref.current;
		if (dialog && !dialog.open) dialog.showModal();
	}, []);
	return (
		<dialog
			ref={ref}
			role="alertdialog"
			data-media={media}
			aria-label={title}
			onClose={onClose}
			onClick={(event) => {
				// A press on the backdrop, outside the box, dismisses it.
				if (event.target === event.currentTarget) onClose();
			}}
			className="x-dialog [--_width:26rem]"
		>
			<div className="flex items-start gap-3">
				{icon && <span className="mt-0.5 flex-none">{icon}</span>}
				<div className="grid min-w-0 gap-1.5">
					<h2 className="text-title font-semibold">{title}</h2>
					<div className="text-fg-muted">{children}</div>
				</div>
			</div>
			<div className="x-dialog-actions">{actions}</div>
		</dialog>
	);
}
