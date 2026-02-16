import { Button } from '@/components/ui/index.ts';

interface ExportPanelProps {
	file: File | null;
	ready: boolean;
	processing: boolean;
	progress: number;
	selectedPreset: string | null;
	resultUrl: string | null;
	error: string | null;
	onExport: () => void;
	onDownload: () => void;
}

export function ExportPanel({
	file,
	ready,
	processing,
	progress,
	selectedPreset,
	resultUrl,
	error,
	onExport,
	onDownload,
}: ExportPanelProps) {
	return (
		<div className="flex flex-col gap-4">
			<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">Export</h3>

			{!selectedPreset && (
				<p className="text-[13px] text-text-tertiary">Select a preset from the Presets tab first.</p>
			)}

			{selectedPreset && (
				<div className="rounded-lg bg-accent/5 border border-accent/20 px-3 py-2">
					<p className="text-[13px] text-accent font-medium">Preset selected</p>
					<p className="text-[13px] text-text-tertiary mt-0.5">
						Ready to export. Color corrections will be baked in.
					</p>
				</div>
			)}

			{processing && (
				<div className="flex flex-col items-center py-4">
					<div className="h-8 w-8 rounded-full border-[3px] border-border border-t-accent animate-spin" />
					<p className="mt-2 text-sm font-medium">{Math.round(progress * 100)}%</p>
					<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-raised">
						<div
							className="h-full bg-accent transition-all duration-300"
							style={{ width: `${progress * 100}%` }}
						/>
					</div>
					<p className="mt-2 text-[13px] text-text-tertiary">Do not close this tab during export.</p>
				</div>
			)}

			<Button className="w-full" disabled={!file || !ready || processing || !selectedPreset} onClick={onExport}>
				{processing ? `Exporting ${Math.round(progress * 100)}%` : 'Export'}
			</Button>

			{resultUrl && (
				<Button variant="secondary" className="w-full" onClick={onDownload}>
					Download
				</Button>
			)}

			{error && <p className="text-[13px] text-danger bg-danger/10 rounded-md px-2.5 py-1.5">{error}</p>}
		</div>
	);
}
