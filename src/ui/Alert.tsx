import { type ReactNode, useEffect, useRef } from 'react';

/**
 * A short message that waits for an answer, drawn by the app rather than the browser's own
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
			className="bg-bg text-ink animate-[pop_0.24s_var(--ease-spring)] m-auto w-[min(26rem,calc(100vw-2rem))] rounded-md p-0 shadow-[0_32px_80px_-20px_rgb(0_0_0/0.45),0_0_0_1px_var(--line)] backdrop:bg-black/45 backdrop:backdrop-blur-[3px]"
		>
			<div className="grid gap-4 p-5">
				<div className="flex items-start gap-3">
					{icon && <span className="mt-0.5 flex-none">{icon}</span>}
					<div className="grid min-w-0 gap-1.5">
						<h2 className="text-lead font-semibold tracking-[-0.01em]">{title}</h2>
						<div className="text-body text-ink-2">{children}</div>
					</div>
				</div>
				<div className="flex flex-wrap justify-end gap-2">{actions}</div>
			</div>
		</dialog>
	);
}
