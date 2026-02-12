import { X, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/index.ts';
import { formatFileSize, formatDimensions } from '@/utils/format.ts';

interface ImageInfoModalProps {
	file: File;
	width: number;
	height: number;
	onClose: () => void;
}

export function ImageInfoModal({ file, width, height, onClose }: ImageInfoModalProps) {
	const rows = [
		['Filename', file.name],
		['Size', formatFileSize(file.size)],
		['Dimensions', formatDimensions(width, height)],
		['MIME Type', file.type || 'unknown'],
		['Last Modified', new Date(file.lastModified).toLocaleString()],
	];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-surface p-6 animate-scale-in shadow-2xl">
				{/* Close */}
				<button
					onClick={onClose}
					className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				>
					<X size={16} />
				</button>

				{/* Header */}
				<div className="flex items-center gap-3 mb-5">
					<div className="h-10 w-10 rounded-xl gradient-accent flex items-center justify-center">
						<FileImage size={20} className="text-white" />
					</div>
					<h2 className="text-base font-bold">File Info</h2>
				</div>

				{/* Info rows */}
				<div className="flex flex-col gap-2.5">
					{rows.map(([label, value]) => (
						<div key={label} className="flex items-center justify-between">
							<span className="text-xs text-text-tertiary">{label}</span>
							<span className="text-xs font-medium text-text-secondary truncate ml-4 max-w-[200px] text-right">
								{value}
							</span>
						</div>
					))}
				</div>

				<Button variant="secondary" size="sm" className="w-full mt-5" onClick={onClose}>
					Close
				</Button>
			</div>
		</div>
	);
}
