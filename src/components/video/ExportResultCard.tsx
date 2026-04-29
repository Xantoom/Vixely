import { CheckCircle2, Download, Image as ImageIcon, Sparkles, Wand2, X } from 'lucide-react';
import { memo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { useQuickGifConversion } from '@/hooks/useQuickGifConversion.ts';
import { formatFileSize } from '@/utils/format.ts';

interface ExportResultCardProps {
	resultUrl: string;
	resultBlob: Blob;
	resultFileName: string;
	/** Source video framerate, used as the GIF framerate for quick conversion. */
	sourceFps?: number;
	/** Trigger the existing video download flow */
	onDownloadVideo: () => void;
	/** Open the GIF editor pre-loaded with the source video for fine editing */
	onEditAsGif: (file: File) => void;
	/** Auto-download next exports (persisted by parent) */
	autoDownload: boolean;
	onAutoDownloadChange: (next: boolean) => void;
}

function gifFileNameFor(videoFileName: string): string {
	const base = videoFileName.replace(/\.[^.]+$/, '');
	return `${base}.gif`;
}

export const ExportResultCard = memo(function ExportResultCard({
	resultUrl,
	resultBlob,
	resultFileName,
	sourceFps,
	onDownloadVideo,
	onEditAsGif,
	autoDownload,
	onAutoDownloadChange,
}: ExportResultCardProps) {
	const { status, progress, gifBlob, gifUrl, error, start, cancel, reset } = useQuickGifConversion();

	useEffect(() => {
		reset();
	}, [resultUrl, reset]);

	const gifName = gifFileNameFor(resultFileName);

	const handleConvert = useCallback(() => {
		void start(resultBlob, resultFileName, { sourceFps });
	}, [resultBlob, resultFileName, sourceFps, start]);

	const handleDownloadGif = useCallback(() => {
		if (!gifUrl) return;
		const a = document.createElement('a');
		a.href = gifUrl;
		a.download = gifName;
		a.click();
	}, [gifUrl, gifName]);

	const handleEditAsGifFromSource = useCallback(() => {
		const mime = resultBlob.type || 'video/mp4';
		const file = new File([resultBlob], resultFileName, { type: mime });
		onEditAsGif(file);
	}, [resultBlob, resultFileName, onEditAsGif]);

	const handleEditGifResult = useCallback(() => {
		if (!gifBlob) return;
		const file = new File([gifBlob], gifName, { type: 'image/gif' });
		onEditAsGif(file);
	}, [gifBlob, gifName, onEditAsGif]);

	return (
		<div className="rounded-lg border border-success/25 bg-success/5 overflow-hidden">
			<div className="bg-bg/30 border-b border-success/15">
				<video
					src={resultUrl}
					className="w-full max-h-40 object-contain bg-black"
					autoPlay
					loop
					muted
					playsInline
				/>
			</div>

			<div className="px-4 py-3 flex flex-col gap-3">
				<div className="flex items-start gap-2">
					<CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-success">Export complete</p>
						<p className="text-xs text-text-tertiary truncate font-mono" title={resultFileName}>
							{resultFileName} · {formatFileSize(resultBlob.size)}
						</p>
					</div>
				</div>

				<Button variant="primary" className="w-full" onClick={onDownloadVideo}>
					<Download size={16} />
					Download video
				</Button>

				{status === 'idle' && (
					<>
						<div className="flex items-center gap-2">
							<div className="h-px flex-1 bg-border/60" />
							<span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
								or convert to GIF
							</span>
							<div className="h-px flex-1 bg-border/60" />
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button variant="secondary" onClick={handleConvert}>
								<Sparkles size={16} />
								Quick convert
							</Button>
							<Button variant="secondary" onClick={handleEditAsGifFromSource}>
								<Wand2 size={16} />
								Edit as GIF
							</Button>
						</div>
					</>
				)}

				{status === 'converting' && (
					<div
						aria-live="polite"
						className="rounded-lg border border-border/60 bg-bg/40 px-3 py-3 flex flex-col gap-2"
					>
						<div className="flex items-center justify-between text-sm">
							<span className="text-text-secondary font-medium">Converting to GIF…</span>
							<span className="font-mono font-semibold tabular-nums text-accent">
								{(Math.max(0, progress) * 100).toFixed(1)}%
							</span>
						</div>
						<div className="h-1 rounded-full bg-border/60 overflow-hidden">
							<div
								className="h-full rounded-full bg-accent transition-[width] duration-300"
								style={{ width: `${Math.max(0, progress) * 100}%` }}
							/>
						</div>
						<Button variant="ghost" size="sm" className="self-end" onClick={cancel}>
							<X size={14} />
							Cancel
						</Button>
					</div>
				)}

				{status === 'ready' && gifUrl && gifBlob && (
					<div className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-3 flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<ImageIcon size={16} className="text-accent shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-accent">GIF ready</p>
								<p className="text-xs text-text-tertiary truncate font-mono" title={gifName}>
									{gifName} · {formatFileSize(gifBlob.size)}
								</p>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button variant="primary" onClick={handleDownloadGif}>
								<Download size={16} />
								Download GIF
							</Button>
							<Button variant="secondary" onClick={handleEditGifResult}>
								<Wand2 size={16} />
								Open in GIF editor
							</Button>
						</div>
					</div>
				)}

				{status === 'error' && (
					<div
						aria-live="polite"
						className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-3 flex items-center justify-between gap-3"
					>
						<p className="text-sm text-danger">{error ?? 'Conversion failed.'}</p>
						<Button variant="secondary" size="sm" onClick={handleConvert}>
							Retry
						</Button>
					</div>
				)}

				<label className="flex items-center gap-2 text-xs text-text-tertiary cursor-pointer select-none border-t border-border/30 mt-1 pt-3">
					<input
						type="checkbox"
						checked={autoDownload}
						onChange={(e) => {
							onAutoDownloadChange(e.target.checked);
						}}
						className="h-3.5 w-3.5 accent-accent cursor-pointer"
					/>
					Automatically download future exports
				</label>
			</div>
		</div>
	);
});
