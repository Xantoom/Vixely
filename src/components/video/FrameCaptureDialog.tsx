import { X, Image as ImageIcon } from 'lucide-react';
import { useCallback } from 'react';
import { Button } from '@/components/ui/index.ts';
import { formatFileSize } from '@/utils/format.ts';

interface FrameCaptureDialogProps {
	/** Raw PNG data from FFmpeg screenshot */
	pngData: Uint8Array;
	timestamp: string;
	onClose: () => void;
}

export function FrameCaptureDialog({ pngData, timestamp, onClose }: FrameCaptureDialogProps) {
	const pngSize = pngData.byteLength;
	// Rough JPEG estimate: ~25% of PNG size
	const jpegEstimate = Math.round(pngSize * 0.25);

	const download = useCallback(
		(format: 'png' | 'jpeg') => {
			if (format === 'png') {
				const blob = new Blob([pngData], { type: 'image/png' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `screenshot-${timestamp}.png`;
				a.click();
				URL.revokeObjectURL(url);
			} else {
				// Convert PNG data to JPEG via canvas
				const blob = new Blob([pngData], { type: 'image/png' });
				const url = URL.createObjectURL(blob);
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext('2d')!;
					ctx.drawImage(img, 0, 0);
					canvas.toBlob(
						(jpegBlob) => {
							if (!jpegBlob) return;
							const jpegUrl = URL.createObjectURL(jpegBlob);
							const a = document.createElement('a');
							a.href = jpegUrl;
							a.download = `screenshot-${timestamp}.jpg`;
							a.click();
							URL.revokeObjectURL(jpegUrl);
						},
						'image/jpeg',
						0.92,
					);
					URL.revokeObjectURL(url);
				};
				img.src = url;
			}
			onClose();
		},
		[pngData, timestamp, onClose],
	);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-xs mx-4 rounded-2xl border border-border bg-surface p-6 animate-scale-in shadow-2xl">
				{/* Close */}
				<button
					onClick={onClose}
					className="absolute top-4 right-4 h-7 w-7 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				>
					<X size={16} />
				</button>

				{/* Header */}
				<div className="flex items-center gap-3 mb-5">
					<div className="h-10 w-10 rounded-xl gradient-accent flex items-center justify-center">
						<ImageIcon size={20} className="text-white" />
					</div>
					<h2 className="text-sm font-bold">Save Frame</h2>
				</div>

				<div className="flex flex-col gap-2">
					<Button variant="secondary" className="w-full justify-between" onClick={() => download('png')}>
						<span>Lossless PNG</span>
						<span className="text-[10px] text-text-tertiary font-mono">{formatFileSize(pngSize)}</span>
					</Button>
					<Button variant="secondary" className="w-full justify-between" onClick={() => download('jpeg')}>
						<span>Optimized JPEG</span>
						<span className="text-[10px] text-text-tertiary font-mono">
							~{formatFileSize(jpegEstimate)}
						</span>
					</Button>
				</div>
			</div>
		</div>
	);
}
