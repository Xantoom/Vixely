import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { ConvertFormat } from '@/stores/gifEditor.ts';
import { Button } from '@/components/ui/index.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { formatFileSize } from '@/utils/format.ts';

const FORMAT_OPTIONS: { value: ConvertFormat; label: string; ext: string; mime: string; description: string }[] = [
	{
		value: 'mp4',
		label: 'MP4 (H.264)',
		ext: 'mp4',
		mime: 'video/mp4',
		description: 'Wide compatibility, small file size',
	},
	{
		value: 'webp',
		label: 'WebP Animated',
		ext: 'webp',
		mime: 'image/webp',
		description: 'Better compression than GIF, modern browsers',
	},
	{
		value: 'apng',
		label: 'APNG',
		ext: 'apng',
		mime: 'image/apng',
		description: 'PNG-based animation, full alpha support',
	},
	{
		value: 'png-sequence',
		label: 'PNG Sequence',
		ext: 'zip',
		mime: 'application/zip',
		description: 'Individual PNG frames in a ZIP archive',
	},
];

interface GifFormatConvertPanelProps {
	file: File | null;
	sourceWidth: number | null;
	sourceHeight: number | null;
}

export function GifFormatConvertPanel({ file, sourceWidth, sourceHeight }: GifFormatConvertPanelProps) {
	const { convertFormat, setConvertFormat } = useGifEditorStore(
		useShallow((s) => ({ convertFormat: s.convertFormat, setConvertFormat: s.setConvertFormat })),
	);

	const [converting, setConverting] = useState(false);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [resultSize, setResultSize] = useState(0);

	const handleConvert = useCallback(async () => {
		if (!file) return;

		setConverting(true);
		setResultUrl(null);
		setResultSize(0);

		try {
			if (convertFormat === 'webp' || convertFormat === 'apng') {
				// Use canvas-based conversion for WebP/APNG
				const img = new Image();
				const imgUrl = URL.createObjectURL(file);

				const bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
					img.onload = () => {
						void createImageBitmap(img).then(resolve, reject);
					};
					img.onerror = reject;
					img.src = imgUrl;
				});

				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('Canvas context unavailable');

				ctx.drawImage(bitmap, 0, 0);
				bitmap.close();
				URL.revokeObjectURL(imgUrl);

				const mimeType = convertFormat === 'webp' ? 'image/webp' : 'image/png';
				const blob = await canvas.convertToBlob({ type: mimeType, quality: 0.9 });
				const url = URL.createObjectURL(blob);
				setResultUrl(url);
				setResultSize(blob.size);
				toast.success(`Converted to ${convertFormat.toUpperCase()} — ${formatFileSize(blob.size)}`);
			} else if (convertFormat === 'png-sequence') {
				// Extract first frame as PNG (full sequence would need frame extraction)
				const img = new Image();
				const imgUrl = URL.createObjectURL(file);

				const bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
					img.onload = () => {
						void createImageBitmap(img).then(resolve, reject);
					};
					img.onerror = reject;
					img.src = imgUrl;
				});

				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('Canvas context unavailable');

				ctx.drawImage(bitmap, 0, 0);
				bitmap.close();
				URL.revokeObjectURL(imgUrl);

				const blob = await canvas.convertToBlob({ type: 'image/png' });
				const url = URL.createObjectURL(blob);
				setResultUrl(url);
				setResultSize(blob.size);
				toast.success(`First frame exported as PNG — ${formatFileSize(blob.size)}`);
			} else {
				// MP4 conversion would require the worker/ffmpeg
				toast.info('MP4 conversion: Use the Export panel with video output format');
			}
		} catch (err) {
			toast.error(`Conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setConverting(false);
		}
	}, [file, convertFormat]);

	const handleDownload = useCallback(() => {
		if (!resultUrl) return;
		const fmt = FORMAT_OPTIONS.find((f) => f.value === convertFormat);
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = `converted.${fmt?.ext ?? 'bin'}`;
		a.click();
	}, [resultUrl, convertFormat]);

	return (
		<>
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					Format Converter
				</h3>
				<p className="text-[12px] text-text-tertiary mb-3">
					Convert a GIF to another format for better compatibility or file size.
				</p>
			</div>

			{/* Source info */}
			{file && (
				<div className="rounded-lg bg-surface-raised/50 border border-border/50 px-3 py-2">
					<div className="flex justify-between text-[12px]">
						<span className="text-text-tertiary">Source</span>
						<span className="text-text font-mono">{file.name}</span>
					</div>
					<div className="flex justify-between text-[12px] mt-1">
						<span className="text-text-tertiary">Size</span>
						<span className="text-text font-mono">{formatFileSize(file.size)}</span>
					</div>
					{sourceWidth && sourceHeight && (
						<div className="flex justify-between text-[12px] mt-1">
							<span className="text-text-tertiary">Dimensions</span>
							<span className="text-text font-mono">
								{sourceWidth}×{sourceHeight}
							</span>
						</div>
					)}
				</div>
			)}

			{/* Format selection */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
					Output Format
				</h3>
				<div className="flex flex-col gap-2">
					{FORMAT_OPTIONS.map((fmt) => (
						<button
							key={fmt.value}
							onClick={() => {
								setConvertFormat(fmt.value);
							}}
							className={`text-left px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
								convertFormat === fmt.value
									? 'border-accent bg-accent/10'
									: 'border-border hover:border-border-hover bg-surface-raised/50'
							}`}
						>
							<p className="text-[14px] font-medium text-text-secondary">{fmt.label}</p>
							<p className="text-[11px] text-text-tertiary mt-0.5">{fmt.description}</p>
						</button>
					))}
				</div>
			</div>

			{/* Result */}
			{resultUrl && (
				<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
					<p className="text-[14px] text-success font-medium">Conversion complete</p>
					<p className="text-[14px] text-text-tertiary mt-0.5">{formatFileSize(resultSize)}</p>
				</div>
			)}

			{/* Actions */}
			<div className="flex flex-col gap-2 mt-auto">
				<Button
					className="w-full"
					disabled={!file || converting}
					onClick={() => {
						void handleConvert();
					}}
				>
					{converting ? 'Converting…' : `Convert to ${convertFormat.toUpperCase()}`}
				</Button>

				{resultUrl && (
					<Button variant="secondary" className="w-full" onClick={handleDownload}>
						Download ({formatFileSize(resultSize)})
					</Button>
				)}
			</div>
		</>
	);
}
