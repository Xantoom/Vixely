import { formatFileSize } from '@/utils/format.ts';

interface GifPlayerProps {
	sourceUrl: string | null;
	resultUrl: string | null;
	resultSize: number;
	isGifSource: boolean;
	processing: boolean;
	progress: number;
}

export function GifPlayer({ sourceUrl, resultUrl, resultSize, isGifSource, processing, progress }: GifPlayerProps) {
	if (!sourceUrl) return null;

	return (
		<div className="flex items-start gap-6 max-w-5xl w-full">
			{/* Source */}
			<div className="flex-1 min-w-0">
				<p className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Source</p>
				{isGifSource ? (
					<img src={sourceUrl} alt="GIF source" className="w-full rounded-lg bg-black" />
				) : (
					<video src={sourceUrl} loop controls className="w-full rounded-lg bg-black" />
				)}
			</div>

			{/* Result */}
			{resultUrl && !processing && (
				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between mb-2">
						<p className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider">Result</p>
						<span className="text-[14px] font-mono text-success">{formatFileSize(resultSize)}</span>
					</div>
					<div className="rounded-lg border border-success/20 bg-surface overflow-hidden">
						<img src={resultUrl} alt="Generated GIF" className="w-full" />
					</div>
				</div>
			)}

			{/* Processing */}
			{processing && (
				<div className="flex-1 flex flex-col items-center justify-center min-h-50">
					<div className="h-10 w-10 rounded-full border-[3px] border-border border-t-accent animate-spin" />
					<p className="mt-3 text-sm font-medium">{Math.round(progress * 100)}%</p>
					<div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-surface-raised">
						<div
							className="h-full bg-accent transition-all duration-300"
							style={{ width: `${progress * 100}%` }}
						/>
					</div>
					<p className="mt-2 text-[14px] text-text-tertiary">Optimizing palette...</p>
				</div>
			)}
		</div>
	);
}
