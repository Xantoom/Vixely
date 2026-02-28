import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useId } from 'react';
import { Button } from '@/components/ui/index.ts';

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
	const titleId = useId();
	const descriptionId = useId();

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onCancel();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [onCancel]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
			onClick={onCancel}
			role="presentation"
		>
			<div
				className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-slide-up sm:animate-scale-in"
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				onClick={(event) => {
					event.stopPropagation();
				}}
			>
				<div className="h-1.5 w-full bg-gradient-to-r from-danger/80 via-warning/70 to-danger/80" />

				<button
					type="button"
					onClick={onCancel}
					className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/70 transition-colors cursor-pointer"
					aria-label="Close warning modal"
				>
					<X size={16} />
				</button>

				<div className="p-5 sm:p-6">
					<div className="flex items-start gap-3 sm:gap-4">
						<div className="mt-0.5 h-10 w-10 rounded-xl bg-danger/15 text-danger flex items-center justify-center shrink-0">
							<AlertTriangle size={18} />
						</div>
						<div className="min-w-0">
							<h2 id={titleId} className="text-lg font-bold leading-tight">
								{title}
							</h2>
							<p id={descriptionId} className="mt-2 text-sm text-text-secondary leading-relaxed">
								{description}
							</p>
							<div className="mt-3 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-[13px] text-text-secondary">
								Your edits are local to this editor and will be cleared after switching tabs.
							</div>
						</div>
					</div>

					<div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
						<Button variant="ghost" size="md" className="sm:min-w-36" onClick={onCancel}>
							{cancelLabel}
						</Button>
						<Button variant="danger" size="md" className="sm:min-w-44" onClick={onConfirm}>
							{confirmLabel}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
