import { Button } from '@/components/ui/index.ts';

interface ConfirmResetModalProps {
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmResetModal({ onConfirm, onCancel }: ConfirmResetModalProps) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-xs mx-4 rounded-2xl border border-border bg-surface p-5 sm:p-6 animate-scale-in shadow-2xl">
				<h2 className="text-base font-bold mb-2">Unsaved Changes</h2>
				<p className="text-sm text-text-secondary leading-relaxed mb-5">
					All current changes will be lost. Are you sure you want to continue?
				</p>
				<div className="flex gap-2">
					<Button variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="danger" size="sm" className="flex-1" onClick={onConfirm}>
						Discard Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
