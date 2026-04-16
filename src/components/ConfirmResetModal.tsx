import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button.tsx';

interface ConfirmResetModalProps {
	onConfirm: () => void;
	onCancel: () => void;
	title?: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
}

export function ConfirmResetModal({
	onConfirm,
	onCancel,
	title = 'Unsaved Changes',
	description = 'All current changes will be lost. Are you sure you want to continue?',
	confirmLabel = 'Discard Changes',
	cancelLabel = 'Keep Editing',
}: ConfirmResetModalProps) {
	const cancelRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		cancelRef.current?.focus();
	}, []);

	const onKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onCancel();
			}
		},
		[onCancel],
	);

	useEffect(() => {
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [onKeyDown]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4"
			onClick={onCancel}
			role="presentation"
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/60 backdrop-blur-[6px] animate-[confirm-backdrop_250ms_ease-out_both]" />

			{/* Gradient border wrapper */}
			<div
				className="relative w-full max-w-md rounded-xl p-px bg-gradient-to-br from-danger/70 via-warning/50 to-danger/70 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_2px_8px_rgba(0,0,0,0.3),0_0_32px_rgba(248,113,113,0.08)] animate-[confirm-dialog_350ms_cubic-bezier(0.16,1,0.3,1)_both]"
				role="alertdialog"
				aria-modal="true"
				aria-label={title}
				onClick={(e) => {
					e.stopPropagation();
				}}
			>
				{/* Inner surface */}
				<div className="rounded-[11px] bg-surface overflow-hidden">
					{/* Close */}
					<button
						type="button"
						onClick={onCancel}
						className="absolute top-3.5 right-3.5 h-7 w-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer z-10"
						aria-label="Close"
					>
						<X size={14} />
					</button>

					{/* Content */}
					<div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5">
						<div className="flex items-start gap-3.5">
							{/* Icon */}
							<div className="mt-0.5 h-9 w-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0 ring-1 ring-warning/15">
								<AlertTriangle size={16} strokeWidth={2.25} />
							</div>

							{/* Text */}
							<div className="min-w-0 pt-0.5">
								<h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em]">{title}</h2>
								<p className="mt-1.5 text-[13px] text-text-secondary leading-relaxed">{description}</p>
							</div>
						</div>
					</div>

					{/* Actions */}
					<div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end px-5 pb-5 sm:px-6 sm:pb-6">
						<Button ref={cancelRef} variant="ghost" size="md" className="sm:min-w-28" onClick={onCancel}>
							{cancelLabel}
						</Button>
						<Button variant="danger" size="md" className="sm:min-w-36" onClick={onConfirm}>
							{confirmLabel}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
