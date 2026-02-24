import { zipSync } from 'fflate';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import type { ConvertFormat } from '@/stores/gifEditor.ts';
import { Button } from '@/components/ui/index.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';
import { formatFileSize } from '@/utils/format.ts';

// ── ImageDecoder type shims ─────────────────────────────────────────────────
declare global {
	interface Window {
		ImageDecoder?: new (init: { data: ReadableStream; type: string }) => {
			readonly tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
			decode(opts: { frameIndex: number }): Promise<{ image: VideoFrame }>;
			close(): void;
		};
	}
}

const FORMAT_OPTIONS: {
	value: ConvertFormat;
	label: string;
	ext: string;
	description: string;
	requiresDecoder?: boolean;
}[] = [
	{
		value: 'webm',
		label: 'WebM (video)',
		ext: 'webm',
		description: 'Animated video file — much smaller than GIF',
		requiresDecoder: true,
	},
	{
		value: 'png-sequence',
		label: 'PNG Sequence',
		ext: 'zip',
		description: 'All frames as individual PNGs in a ZIP archive',
		requiresDecoder: true,
	},
	{
		value: 'webp',
		label: 'WebP (first frame)',
		ext: 'webp',
		description: 'First frame exported as a static WebP image',
	},
	{ value: 'apng', label: 'PNG (first frame)', ext: 'png', description: 'First frame exported as a PNG image' },
];

interface GifFormatConvertPanelProps {
	file: File | null;
	sourceWidth: number | null;
	sourceHeight: number | null;
}

// ── Frame decoder using ImageDecoder API ────────────────────────────────────
async function decodeAllFrames(
	file: File,
	onProgress: (p: number) => void,
): Promise<{ frames: VideoFrame[]; durationsMs: number[]; width: number; height: number }> {
	const Decoder = window.ImageDecoder;
	if (!Decoder) throw new Error('ImageDecoder API not supported in this browser (use Chrome/Edge 94+)');

	const decoder = new Decoder({ data: file.stream(), type: file.type || 'image/gif' });
	await decoder.tracks.ready;
	const track = decoder.tracks.selectedTrack;
	if (!track) throw new Error('No video track found in file');

	const frameCount = track.frameCount;
	let completed = 0;

	const results = await Promise.all(
		Array.from({ length: frameCount }, async (_, i) => {
			const { image } = await decoder.decode({ frameIndex: i });
			onProgress(++completed / frameCount);
			return image;
		}),
	);

	decoder.close();

	const first = results[0];
	const width = first?.codedWidth ?? 0;
	const height = first?.codedHeight ?? 0;
	const durationsMs = results.map((f) => (f.duration ?? 100000) / 1000);

	return { frames: results, durationsMs, width, height };
}

function frameToCanvas(frame: VideoFrame, w: number, h: number): OffscreenCanvas {
	const canvas = new OffscreenCanvas(w, h);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas context unavailable');
	ctx.drawImage(frame, 0, 0, w, h);
	return canvas;
}

// ── Converters ───────────────────────────────────────────────────────────────
function isCapturableTrack(t: MediaStreamTrack): t is MediaStreamTrack & { requestFrame(): void } {
	return 'requestFrame' in t;
}

async function convertToWebM(file: File, onProgress: (p: number) => void): Promise<Blob> {
	const { frames, durationsMs, width, height } = await decodeAllFrames(file, (p) => {
		onProgress(p * 0.6);
	});

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');
	const ctx2d = ctx; // capture for closure

	const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';

	return new Promise<Blob>((resolve, reject) => {
		const stream = canvas.captureStream(0);
		const recorder = new MediaRecorder(stream, { mimeType });
		const chunks: Blob[] = [];

		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = () => {
			resolve(new Blob(chunks, { type: 'video/webm' }));
		};
		recorder.onerror = () => {
			reject(new Error('MediaRecorder error'));
		};
		recorder.start();

		let frameIdx = 0;
		const rawTrack = stream.getVideoTracks()[0];
		const captureTrack = rawTrack && isCapturableTrack(rawTrack) ? rawTrack : null;

		function drawNext(): void {
			if (frameIdx >= frames.length) {
				recorder.stop();
				frames.forEach((f) => {
					f.close();
				});
				return;
			}
			const frame = frames[frameIdx];
			const delay = durationsMs[frameIdx] ?? 100;
			if (frame) ctx2d.drawImage(frame, 0, 0, width, height);
			captureTrack?.requestFrame();
			onProgress(0.6 + (frameIdx / frames.length) * 0.4);
			frameIdx++;
			setTimeout(drawNext, delay);
		}
		drawNext();
	});
}

async function convertToPngSequence(file: File, onProgress: (p: number) => void): Promise<Blob> {
	const { frames, width, height } = await decodeAllFrames(file, (p) => {
		onProgress(p * 0.7);
	});

	let completed = 0;
	const entries = await Promise.all(
		frames.map(async (frame, i) => {
			const canvas = frameToCanvas(frame, width, height);
			const blob = await canvas.convertToBlob({ type: 'image/png' });
			const data = new Uint8Array(await blob.arrayBuffer());
			onProgress(0.7 + (++completed / frames.length) * 0.3);
			return { key: `frame_${String(i + 1).padStart(4, '0')}.png`, data };
		}),
	);

	frames.forEach((f) => {
		f.close();
	});

	const fileMap: Record<string, Uint8Array> = {};
	entries.forEach(({ key, data }) => {
		fileMap[key] = data;
	});

	const zipped = zipSync(fileMap, { level: 1 }); // fast zip, PNGs already compressed
	return new Blob([zipped.slice(0)], { type: 'application/zip' });
}

async function convertFirstFrame(file: File, format: 'webp' | 'apng'): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas context unavailable');
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	const mime = format === 'webp' ? 'image/webp' : 'image/png';
	return canvas.convertToBlob({ type: mime, quality: 0.9 });
}

// ── Component ────────────────────────────────────────────────────────────────
export function GifFormatConvertPanel({ file, sourceWidth, sourceHeight }: GifFormatConvertPanelProps) {
	const { convertFormat, setConvertFormat } = useGifEditorStore(
		useShallow((s) => ({ convertFormat: s.convertFormat, setConvertFormat: s.setConvertFormat })),
	);

	const [converting, setConverting] = useState(false);
	const [progress, setProgress] = useState(0);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [resultSize, setResultSize] = useState(0);

	const handleConvert = useCallback(async () => {
		if (!file) return;
		setConverting(true);
		setProgress(0);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		setResultUrl(null);
		setResultSize(0);

		try {
			let blob: Blob;

			if (convertFormat === 'webm') {
				blob = await convertToWebM(file, setProgress);
			} else if (convertFormat === 'png-sequence') {
				blob = await convertToPngSequence(file, setProgress);
			} else {
				blob = await convertFirstFrame(file, convertFormat);
			}

			const url = URL.createObjectURL(blob);
			setResultUrl(url);
			setResultSize(blob.size);
			setProgress(1);
			toast.success(`Converted — ${formatFileSize(blob.size)}`);
		} catch (err) {
			toast.error(`Conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setConverting(false);
		}
	}, [file, convertFormat, resultUrl]);

	const handleDownload = useCallback(() => {
		if (!resultUrl) return;
		const fmt = FORMAT_OPTIONS.find((f) => f.value === convertFormat);
		const a = document.createElement('a');
		a.href = resultUrl;
		a.download = `converted.${fmt?.ext ?? 'bin'}`;
		a.click();
	}, [resultUrl, convertFormat]);

	const hasDecoder = typeof window !== 'undefined' && 'ImageDecoder' in window;
	const selectedFmt = FORMAT_OPTIONS.find((f) => f.value === convertFormat);

	return (
		<>
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					Format Converter
				</h3>
				<p className="text-[12px] text-text-tertiary mb-3">
					Convert a GIF to another format for better compatibility or smaller file size.
				</p>
			</div>

			{/* Source info */}
			{file && (
				<div className="rounded-lg bg-surface-raised/50 border border-border/50 px-3 py-2">
					<div className="flex justify-between text-[12px]">
						<span className="text-text-tertiary">Source</span>
						<span className="text-text font-mono truncate max-w-[140px]">{file.name}</span>
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

			{/* Browser support warning */}
			{!hasDecoder && (
				<div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
					<p className="text-[12px] text-amber-400">
						WebM and PNG Sequence require Chrome or Edge 94+. First-frame exports work in all browsers.
					</p>
				</div>
			)}

			{/* Format selection */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
					Output Format
				</h3>
				<div className="flex flex-col gap-2">
					{FORMAT_OPTIONS.map((fmt) => {
						const disabled = fmt.requiresDecoder && !hasDecoder;
						return (
							<button
								key={fmt.value}
								onClick={() => {
									if (!disabled) setConvertFormat(fmt.value);
								}}
								disabled={disabled}
								className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
									disabled
										? 'opacity-40 cursor-not-allowed border-border bg-surface-raised/30'
										: convertFormat === fmt.value
											? 'border-accent bg-accent/10 cursor-pointer'
											: 'border-border hover:border-border-hover bg-surface-raised/50 cursor-pointer'
								}`}
							>
								<p className="text-[14px] font-medium text-text-secondary">{fmt.label}</p>
								<p className="text-[11px] text-text-tertiary mt-0.5">{fmt.description}</p>
							</button>
						);
					})}
				</div>
			</div>

			{/* Progress */}
			{converting && (
				<div>
					<div className="flex justify-between text-[12px] text-text-tertiary mb-1">
						<span>Converting…</span>
						<span>{Math.round(progress * 100)}%</span>
					</div>
					<div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
						<div
							className="h-full bg-accent rounded-full transition-all duration-150"
							style={{ width: `${Math.round(progress * 100)}%` }}
						/>
					</div>
				</div>
			)}

			{/* Result */}
			{resultUrl && !converting && (
				<div className="rounded-lg bg-success/5 border border-success/20 px-3 py-2">
					<p className="text-[14px] text-success font-medium">Conversion complete</p>
					<p className="text-[12px] text-text-tertiary mt-0.5">
						{selectedFmt?.label} — {formatFileSize(resultSize)}
					</p>
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
					{converting
						? `Converting… ${Math.round(progress * 100)}%`
						: `Convert to ${selectedFmt?.label ?? convertFormat}`}
				</Button>

				{resultUrl && !converting && (
					<Button variant="secondary" className="w-full" onClick={handleDownload}>
						Download ({formatFileSize(resultSize)})
					</Button>
				)}
			</div>
		</>
	);
}
