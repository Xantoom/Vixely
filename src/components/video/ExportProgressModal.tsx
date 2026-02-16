interface ExportProgressModalProps {
	progress: number;
	onCancel?: () => void;
}

export function ExportProgressModal({ progress }: ExportProgressModalProps) {
	const pct = Math.round(progress * 100);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-xs mx-4 rounded-2xl border border-border bg-surface p-6 animate-scale-in shadow-2xl text-center">
				<div className="h-12 w-12 mx-auto rounded-full border-[3px] border-border border-t-accent animate-spin" />

				<h2 className="mt-4 text-sm font-bold">Exporting Video</h2>
				<p className="mt-1 text-[13px] text-text-secondary">{pct}% complete</p>

				<div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
					<div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
				</div>

				<p className="mt-3 text-[13px] text-text-tertiary">Please do not close this tab while exporting.</p>
			</div>
		</div>
	);
}
