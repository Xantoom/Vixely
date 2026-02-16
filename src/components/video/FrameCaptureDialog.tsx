import { X, Image as ImageIcon, Download, ArrowRight } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/index.ts';
import { formatFileSize } from '@/utils/format.ts';

type FrameFormat = 'png' | 'jpeg' | 'webp';

interface FrameCaptureDialogProps {
	pngData: Uint8Array;
	timestamp: string;
	onClose: () => void;
	onExportToImageEditor?: (file: File) => void;
}

function FormatCard({
	ext,
	label,
	quality,
	qualityColor,
	size,
	selected,
	onClick,
}: {
	ext: string;
	label: string;
	quality: string;
	qualityColor: string;
	size: string;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer ${
				selected
					? 'border-accent/35 bg-accent/10'
					: 'border-border bg-surface-raised/50 hover:bg-surface-raised'
			}`}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<span
						className={`text-[13px] font-bold font-mono px-1.5 py-0.5 rounded ${
							selected ? 'bg-accent/20 text-accent' : 'bg-surface-raised text-text-tertiary'
						}`}
					>
						{ext}
					</span>
					<span className="text-[13px] font-medium text-text">{label}</span>
				</div>
				<div className="flex items-center gap-3">
					<span className={`text-[13px] font-medium ${qualityColor}`}>{quality}</span>
					<span className="text-[13px] text-text-tertiary font-mono">{size}</span>
				</div>
			</div>
		</button>
	);
}

export function FrameCaptureDialog({ pngData, timestamp, onClose, onExportToImageEditor }: FrameCaptureDialogProps) {
	const [format, setFormat] = useState<FrameFormat>('png');
	const pngSize = pngData.byteLength;
	const estimates = useMemo(
		() => ({ png: pngSize, jpeg: Math.round(pngSize * 0.25), webp: Math.round(pngSize * 0.18) }),
		[pngSize],
	);

	const renderToFormatBlob = useCallback(
		async (formatToUse: FrameFormat): Promise<Blob> => {
			if (formatToUse === 'png')
				return Promise.resolve(new Blob([new Uint8Array(pngData)], { type: 'image/png' }));
			return new Promise((resolve, reject) => {
				const sourceBlob = new Blob([new Uint8Array(pngData)], { type: 'image/png' });
				const sourceUrl = URL.createObjectURL(sourceBlob);
				const img = new Image();

				img.onload = () => {
					const canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						URL.revokeObjectURL(sourceUrl);
						reject(new Error('Canvas context unavailable'));
						return;
					}
					ctx.drawImage(img, 0, 0);
					canvas.toBlob(
						(converted) => {
							URL.revokeObjectURL(sourceUrl);
							if (!converted) {
								reject(new Error('Failed to encode frame'));
								return;
							}
							resolve(converted);
						},
						formatToUse === 'jpeg' ? 'image/jpeg' : 'image/webp',
						0.92,
					);
				};

				img.onerror = () => {
					URL.revokeObjectURL(sourceUrl);
					reject(new Error('Failed to decode frame'));
				};

				img.src = sourceUrl;
			});
		},
		[pngData],
	);

	const download = useCallback(
		async (formatToUse: FrameFormat) => {
			const blob = await renderToFormatBlob(formatToUse);
			const ext = formatToUse === 'jpeg' ? 'jpg' : formatToUse;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `screenshot-${timestamp}.${ext}`;
			a.click();
			URL.revokeObjectURL(url);
			onClose();
		},
		[renderToFormatBlob, timestamp, onClose],
	);

	const exportToImageEditor = useCallback(async () => {
		if (!onExportToImageEditor) return;
		const blob = await renderToFormatBlob(format);
		const ext = format === 'jpeg' ? 'jpg' : format;
		const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
		const file = new File([blob], `screenshot-${timestamp}.${ext}`, { type: mime });
		onExportToImageEditor(file);
		onClose();
	}, [format, onExportToImageEditor, onClose, renderToFormatBlob, timestamp]);

	const actionDisabled = !onExportToImageEditor;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-surface p-6 animate-scale-in shadow-2xl">
				<button
					onClick={onClose}
					className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				>
					<X size={16} />
				</button>

				<div className="flex items-center gap-3 mb-5">
					<div className="h-10 w-10 rounded-xl gradient-accent flex items-center justify-center">
						<ImageIcon size={20} className="text-white" />
					</div>
					<div>
						<h2 className="text-base font-bold">Capture Frame</h2>
						<p className="text-[13px] text-text-tertiary">Choose format and action</p>
					</div>
				</div>

				<div className="flex flex-col gap-3">
					{/* Lossless */}
					<div>
						<div className="flex items-center gap-2 mb-2">
							<div className="h-2 w-2 rounded-full bg-emerald-400" />
							<span className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
								Lossless
							</span>
							<span className="text-[13px] text-text-tertiary ml-auto">Perfect quality</span>
						</div>
						<FormatCard
							ext=".PNG"
							label="PNG"
							quality="100%"
							qualityColor="text-emerald-400"
							size={formatFileSize(estimates.png)}
							selected={format === 'png'}
							onClick={() => {
								setFormat('png');
							}}
						/>
					</div>

					<div className="h-px bg-border/50" />

					{/* Lossy */}
					<div>
						<div className="flex items-center gap-2 mb-2">
							<div className="h-2 w-2 rounded-full bg-amber-400" />
							<span className="text-[13px] font-semibold text-text-secondary uppercase tracking-wider">
								Lossy
							</span>
							<span className="text-[13px] text-text-tertiary ml-auto">Smaller file</span>
						</div>
						<div className="flex flex-col gap-1.5">
							<FormatCard
								ext=".JPG"
								label="JPEG"
								quality="~92%"
								qualityColor="text-amber-400"
								size={`~${formatFileSize(estimates.jpeg)}`}
								selected={format === 'jpeg'}
								onClick={() => {
									setFormat('jpeg');
								}}
							/>
							<FormatCard
								ext=".WEBP"
								label="WebP"
								quality="~92%"
								qualityColor="text-amber-400"
								size={`~${formatFileSize(estimates.webp)}`}
								selected={format === 'webp'}
								onClick={() => {
									setFormat('webp');
								}}
							/>
						</div>
					</div>
				</div>

				<div className="mt-4 flex gap-2">
					<Button
						variant="secondary"
						className="flex-1"
						onClick={() => {
							void download(format);
						}}
					>
						<Download size={14} />
						Download
					</Button>
					<Button
						className="flex-1"
						onClick={() => {
							void exportToImageEditor();
						}}
						disabled={actionDisabled}
					>
						<ArrowRight size={14} />
						Image Editor
					</Button>
				</div>
				{actionDisabled && (
					<p className="mt-2 text-[13px] text-text-tertiary">Image editor transfer unavailable.</p>
				)}
			</div>
		</div>
	);
}
