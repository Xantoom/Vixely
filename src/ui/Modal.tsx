import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { m } from '@/paraglide/messages.js';
import { IconButton } from './Button';

/**
 * A large dialog over the page, for work that needs room without leaving it: a title bar with
 * what `header` adds, and the body filling the rest. Escape or the close button closes it.
 */
export function Modal({
	title,
	header,
	onClose,
	media,
	children,
}: {
	title: string;
	header?: ReactNode;
	onClose: () => void;
	/** The editor's colour inside, as `data-media` gives it. */
	media?: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		const dialog = ref.current;
		// Removing the element closes it: closing it here would report a close to the parent, which
		// React's double mount in development would take for the user's.
		if (dialog && !dialog.open) dialog.showModal();
	}, []);
	return (
		<dialog
			ref={ref}
			aria-label={title}
			data-media={media}
			onClose={onClose}
			className="bg-bg text-ink animate-[pop_0.24s_var(--ease-spring)] m-auto grid h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md p-0 shadow-[0_32px_80px_-20px_rgb(0_0_0/0.45),0_0_0_1px_var(--line)] backdrop:bg-black/45 backdrop:backdrop-blur-[3px]"
		>
			<div className="relative flex min-w-0 items-center gap-4 px-5 py-3">
				<h2 className="text-title flex-none font-[650] tracking-[-0.02em]">{title}</h2>
				<div className="min-w-0 flex-1">{header}</div>
				<IconButton label={m.close_panel()} onClick={onClose}>
					<X className="size-5" />
				</IconButton>
				<span aria-hidden="true" className="separator absolute inset-x-5 bottom-0" />
			</div>
			{children}
		</dialog>
	);
}
