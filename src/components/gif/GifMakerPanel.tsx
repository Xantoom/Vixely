import { useCallback, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/index.ts';
import { useObjectUrlState } from '@/hooks/useObjectUrlState.ts';
import { encodeGif } from '@/modules/gif-editor/encode/gif-encoder.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { buildExportFilename } from '@/utils/exportFilename.ts';
import { formatFileSize } from '@/utils/format.ts';

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/bmp';

interface MakerImage {
	id: string;
	file: File;
	url: string;
	width: number;
	height: number;
	delayCentiseconds: number;
}

async function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
	const bitmap = await createImageBitmap(file);
	const { width, height } = bitmap;
	bitmap.close();
	return { width, height };
}

async function imagesToRgbaFrames(
	images: MakerImage[],
	targetWidth: number,
): Promise<{ frames: Uint8Array[]; width: number; height: number }> {
	const firstImg = images[0];
	if (!firstImg) throw new Error('No images provided');
	const aspect = firstImg.width / firstImg.height;
	const targetHeight = Math.round(targetWidth / aspect);

	const canvas = new OffscreenCanvas(targetWidth, targetHeight);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas context unavailable');

	const bitmaps = await Promise.all(images.map(async (img) => createImageBitmap(img.file)));

	const frames: Uint8Array[] = [];
	for (const bitmap of bitmaps) {
		ctx.clearRect(0, 0, targetWidth, targetHeight);
		ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
		bitmap.close();
		const data = ctx.getImageData(0, 0, targetWidth, targetHeight);
		frames.push(new Uint8Array(data.data));
	}
	return { frames, width: targetWidth, height: targetHeight };
}

let nextId = 0;

export function GifMakerPanel() {
	const [images, setImages] = useState<MakerImage[]>([]);
	const [outputWidth, setOutputWidth] = useState<number>(0);
	const [generating, setGenerating] = useState(false);
	const [resultUrl, setResultUrl] = useObjectUrlState();
	const [resultSize, setResultSize] = useState(0);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkDelay, setBulkDelay] = useState(50);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragIdx = useRef<number | null>(null);

	const widthId = useId();
	const bulkDelayId = useId();

	const { loopCount, colorReduction, compressionSpeed } = useGifEditorStore(
		useShallow((s) => ({
			loopCount: s.loopCount,
			colorReduction: s.colorReduction,
			compressionSpeed: s.compressionSpeed,
		})),
	);

	const handleFiles = useCallback(async (files: FileList | null) => {
		if (!files || files.length === 0) return;

		const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
		if (validFiles.length === 0) return;

		const dimensions = await Promise.all(validFiles.map(loadImageDimensions));
		const newImages: MakerImage[] = validFiles.map((file, i) => {
			const dim = dimensions[i] ?? { width: 0, height: 0 };
			return {
				id: `maker-${++nextId}`,
				file,
				url: URL.createObjectURL(file),
				width: dim.width,
				height: dim.height,
				delayCentiseconds: 50,
			};
		});

		if (newImages.length === 0) return;

		setImages((prev) => {
			const merged = [...prev, ...newImages];
			const first = newImages[0];
			if (prev.length === 0 && first) {
				setOutputWidth(first.width);
			}
			return merged;
		});
	}, []);

	const removeImage = useCallback((id: string) => {
		setImages((prev) => {
			const img = prev.find((i) => i.id === id);
			if (img) URL.revokeObjectURL(img.url);
			return prev.filter((i) => i.id !== id);
		});
		setSelected((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}, []);

	const removeSelected = useCallback(() => {
		setImages((prev) => {
			for (const img of prev) {
				if (selected.has(img.id)) URL.revokeObjectURL(img.url);
			}
			return prev.filter((i) => !selected.has(i.id));
		});
		setSelected(new Set());
	}, [selected]);

	const setAllDelays = useCallback(() => {
		setImages((prev) => prev.map((img) => ({ ...img, delayCentiseconds: bulkDelay })));
	}, [bulkDelay]);

	const updateDelay = useCallback((id: string, delay: number) => {
		setImages((prev) => prev.map((img) => (img.id === id ? { ...img, delayCentiseconds: delay } : img)));
	}, []);

	const toggleSelect = useCallback((id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	// Drag reorder
	const handleDragStart = useCallback((idx: number) => {
		dragIdx.current = idx;
	}, []);

	const handleDrop = useCallback((dropIdx: number) => {
		const fromIdx = dragIdx.current;
		if (fromIdx === null || fromIdx === dropIdx) return;
		setImages((prev) => {
			const next = [...prev];
			const [moved] = next.splice(fromIdx, 1);
			if (!moved) return prev;
			next.splice(dropIdx, 0, moved);
			return next;
		});
		dragIdx.current = null;
	}, []);

	const handleGenerate = useCallback(async () => {
		if (images.length < 2) {
			toast.error('Add at least 2 images to create a GIF');
			return;
		}
		if (outputWidth < 1) {
			toast.error('Output width must be at least 1px');
			return;
		}

		setGenerating(true);
		setResultUrl(null);
		setResultSize(0);

		try {
			const { frames, width, height } = await imagesToRgbaFrames(images, outputWidth);
			const frameDelaysCs = images.map((img) => img.delayCentiseconds);

			const blob = await encodeGif({
				frames,
				width,
				height,
				fps: 10,
				maxColors: colorReduction,
				speed: compressionSpeed,
				loopCount,
				frameDelaysCs,
			});

			const url = URL.createObjectURL(blob);
			setResultUrl(url);
			setResultSize(blob.size);
			toast.success(`GIF created — ${formatFileSize(blob.size)}`);
		} catch (err) {
			toast.error(`GIF encoding failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setGenerating(false);
		}
	}, [images, outputWidth, colorReduction, compressionSpeed, loopCount, setResultUrl]);

	const handleDownload = useCallback(() => {
		if (!resultUrl) return;
		const firstSourceName = images[0]?.file.name;
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = buildExportFilename(firstSourceName, 'gif', 'created');
		a.click();
	}, [resultUrl, images]);

	return (
		<>
			{/* Upload */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">Images</h3>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept={ACCEPTED_TYPES}
					className="hidden"
					onChange={(e) => {
						void handleFiles(e.target.files);
						e.target.value = '';
					}}
				/>
				<Button
					variant="secondary"
					className="w-full"
					onClick={() => {
						fileInputRef.current?.click();
					}}
				>
					{images.length === 0 ? 'Add Images' : `Add More (${images.length} loaded)`}
				</Button>
			</div>

			{/* Image List */}
			{images.length > 0 && (
				<div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
					{images.map((img, idx) => (
						<div
							key={img.id}
							draggable
							onDragStart={() => {
								handleDragStart(idx);
							}}
							onDragOver={(e) => {
								e.preventDefault();
							}}
							onDrop={() => {
								handleDrop(idx);
							}}
							className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-grab transition-all ${
								selected.has(img.id)
									? 'bg-accent/10 border border-accent/30'
									: 'bg-surface-raised/50 border border-transparent hover:bg-surface-raised'
							}`}
						>
							<button
								onClick={() => {
									toggleSelect(img.id);
								}}
								className="shrink-0 w-5 h-5 rounded border border-border flex items-center justify-center cursor-pointer"
							>
								{selected.has(img.id) && <span className="block w-2.5 h-2.5 rounded-sm bg-accent" />}
							</button>
							<img src={img.url} alt="" className="shrink-0 w-10 h-10 rounded object-cover bg-bg/50" />
							<div className="flex-1 min-w-0">
								<p className="text-[12px] text-text-secondary truncate">{img.file.name}</p>
								<p className="text-[12px] text-text-tertiary">
									{img.width}×{img.height}
								</p>
							</div>
							<input
								type="number"
								min={1}
								max={6553}
								value={img.delayCentiseconds}
								onChange={(e) => {
									updateDelay(img.id, Math.max(1, Math.min(6553, Number(e.target.value))));
								}}
								title="Delay (cs)"
								className="w-16 h-7 px-1.5 rounded-md bg-surface-raised/60 border border-border text-[12px] font-mono text-text tabular-nums text-center focus:outline-none focus:border-accent/50"
							/>
							<span className="text-[10px] text-text-tertiary shrink-0">cs</span>
							<button
								onClick={() => {
									removeImage(img.id);
								}}
								className="shrink-0 text-text-tertiary hover:text-danger text-[14px] cursor-pointer px-1 transition-colors"
								title="Remove"
							>
								✕
							</button>
						</div>
					))}
				</div>
			)}

			{/* Bulk Controls */}
			{images.length > 0 && (
				<div>
					<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
						Bulk Controls
					</h3>
					<div className="flex items-center gap-2 mb-2">
						<label htmlFor={bulkDelayId} className="text-[14px] text-text-secondary shrink-0">
							Set all delays
						</label>
						<input
							id={bulkDelayId}
							type="number"
							min={1}
							max={6553}
							value={bulkDelay}
							onChange={(e) => {
								setBulkDelay(Math.max(1, Math.min(6553, Number(e.target.value))));
							}}
							className="w-20 h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums text-center focus:outline-none focus:border-accent/50"
						/>
						<span className="text-[12px] text-text-tertiary">cs</span>
						<Button variant="ghost" size="sm" onClick={setAllDelays}>
							Apply
						</Button>
					</div>
					{selected.size > 0 && (
						<Button variant="danger" size="sm" onClick={removeSelected}>
							Remove Selected ({selected.size})
						</Button>
					)}
				</div>
			)}

			{/* Output Width */}
			{images.length > 0 && (
				<div>
					<label htmlFor={widthId} className="text-[14px] font-medium text-text-secondary mb-1.5 block">
						Output Width
					</label>
					<input
						id={widthId}
						type="number"
						min={1}
						max={4096}
						value={outputWidth}
						onChange={(e) => {
							setOutputWidth(Math.max(1, Math.min(4096, Number(e.target.value))));
						}}
						className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
					/>
					<p className="text-[12px] text-text-tertiary mt-1">
						Height auto-calculated from first image aspect ratio
					</p>
				</div>
			)}

			{/* Result */}
			{resultUrl && (
				<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
					<p className="text-[14px] text-success font-medium">GIF ready</p>
					<p className="text-[14px] text-text-tertiary mt-0.5">{formatFileSize(resultSize)}</p>
				</div>
			)}

			{resultUrl && (
				<div className="rounded-lg bg-bg/50 p-2 flex items-center justify-center">
					<img src={resultUrl} alt="Generated GIF preview" className="max-w-full max-h-48 rounded" />
				</div>
			)}

			{/* Actions */}
			<div className="flex flex-col gap-2 mt-auto">
				<Button
					className="w-full"
					disabled={images.length < 2 || generating}
					onClick={() => {
						void handleGenerate();
					}}
				>
					{generating ? 'Generating…' : 'Create GIF'}
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
