import { X, Film } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { formatDateTime, formatDimensions, formatFileSize } from '@/utils/format.ts';

interface GifInfoModalProps {
	file: File;
	width: number | null;
	height: number | null;
	duration: number;
	fps: number;
	frameCount?: number;
	isGifSource: boolean;
	onClose: () => void;
}

export function GifInfoModal({
	file,
	width,
	height,
	duration,
	fps,
	frameCount,
	isGifSource,
	onClose,
}: GifInfoModalProps) {
	const estimatedFrames = frameCount ?? Math.ceil(duration * fps);
	const ext = file.name.split('.').pop()?.toUpperCase() ?? '—';

	const sections = [
		{
			label: 'Overview',
			rows: [
				['Filename', file.name],
				['Source Type', isGifSource ? 'GIF' : `Video (${ext})`],
				['Size', formatFileSize(file.size)],
			],
		},
		{
			label: 'Dimensions',
			rows: [
				['Resolution', width != null && height != null ? formatDimensions(width, height) : '—'],
				[
					'Aspect Ratio',
					width != null && height != null && width > 0 && height > 0
						? `${(width / height).toFixed(2)}:1`
						: '—',
				],
			],
		},
		{
			label: 'Timing',
			rows: [
				['Duration', `${duration.toFixed(2)}s`],
				['Frame Rate', `${fps} fps`],
				['Frames', `${estimatedFrames}`],
			],
		},
		{
			label: 'File',
			rows: [
				['MIME Type', file.type || 'unknown'],
				['Last Modified', formatDateTime(file.lastModified)],
			],
		},
	];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-surface p-5 animate-scale-in shadow-2xl">
				<button
					onClick={onClose}
					className="absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				>
					<X size={15} />
				</button>

				<div className="flex items-center gap-3 mb-4">
					<div className="h-9 w-9 rounded-xl gradient-accent flex items-center justify-center">
						<Film size={18} className="text-white" />
					</div>
					<h2 className="text-[15px] font-bold">GIF Info</h2>
				</div>

				<div className="flex flex-col gap-4">
					{sections.map((section) => (
						<div key={section.label}>
							<h3 className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">
								{section.label}
							</h3>
							<div className="flex flex-col gap-1.5">
								{section.rows.map(([label, value]) => (
									<div key={label} className="flex items-center justify-between">
										<span className="text-[13px] text-text-tertiary">{label}</span>
										<span className="text-[13px] font-medium text-text-secondary truncate ml-4 max-w-[200px] text-right">
											{value}
										</span>
									</div>
								))}
							</div>
						</div>
					))}
				</div>

				<Button variant="secondary" size="sm" className="w-full mt-4" onClick={onClose}>
					Close
				</Button>
			</div>
		</div>
	);
}
