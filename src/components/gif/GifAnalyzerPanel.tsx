import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/index.ts';
import { formatFileSize } from '@/utils/format.ts';

interface GifAnalysis {
	version: string;
	width: number;
	height: number;
	frames: number;
	globalColorTable: boolean;
	globalColorTableSize: number;
	backgroundColorIndex: number;
	loopCount: number | null;
	totalDuration: number;
	minFrameDelay: number;
	maxFrameDelay: number;
	avgFrameDelay: number;
	hasTransparency: boolean;
	commentExtensions: string[];
	fileSize: number;
}

interface GifAnalyzerPanelProps {
	file: File | null;
}

function readUint16LE(data: Uint8Array, offset: number): number {
	return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

function byteAt(data: Uint8Array, offset: number): number {
	return data[offset] ?? 0;
}

async function analyzeGif(file: File): Promise<GifAnalysis> {
	const buffer = await file.arrayBuffer();
	const data = new Uint8Array(buffer);

	// GIF Header (6 bytes): "GIF87a" or "GIF89a"
	const signature = String.fromCharCode(byteAt(data, 0), byteAt(data, 1), byteAt(data, 2));
	const version = String.fromCharCode(byteAt(data, 3), byteAt(data, 4), byteAt(data, 5));
	if (signature !== 'GIF') throw new Error('Not a valid GIF file');

	// Logical Screen Descriptor (7 bytes)
	const width = readUint16LE(data, 6);
	const height = readUint16LE(data, 8);
	const packed = byteAt(data, 10);
	const hasGCT = (packed & 0x80) !== 0;
	const gctSize = hasGCT ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
	const backgroundColorIndex = byteAt(data, 11);

	let offset = 13 + gctSize;

	let frameCount = 0;
	let loopCount: number | null = null;
	let totalDelay = 0;
	let minDelay = Infinity;
	let maxDelay = 0;
	let hasTransparency = false;
	const comments: string[] = [];

	while (offset < data.length) {
		const block = byteAt(data, offset);

		if (block === 0x3b) break; // Trailer

		if (block === 0x2c) {
			// Image Descriptor
			frameCount++;
			const imgPacked = byteAt(data, offset + 9);
			const hasLCT = (imgPacked & 0x80) !== 0;
			const lctSize = hasLCT ? 3 * (1 << ((imgPacked & 0x07) + 1)) : 0;
			offset += 10 + lctSize;

			// Skip LZW minimum code size
			offset++;

			// Skip sub-blocks
			while (offset < data.length) {
				const blockSize = byteAt(data, offset);
				offset++;
				if (blockSize === 0) break;
				offset += blockSize;
			}
			continue;
		}

		if (block === 0x21) {
			// Extension
			const extLabel = byteAt(data, offset + 1);

			if (extLabel === 0xf9) {
				// Graphic Control Extension
				const gcPacked = byteAt(data, offset + 3);
				const disposalMethod = (gcPacked >> 2) & 0x07;
				const transparentFlag = (gcPacked & 0x01) !== 0;
				if (transparentFlag || disposalMethod === 2) hasTransparency = true;
				const delay = readUint16LE(data, offset + 4) * 10; // Convert to ms
				totalDelay += delay;
				if (delay > 0) {
					minDelay = Math.min(minDelay, delay);
					maxDelay = Math.max(maxDelay, delay);
				}
				offset += 8;
				continue;
			}

			if (extLabel === 0xff) {
				// Application Extension (NETSCAPE2.0 for loop count)
				const blockLen = byteAt(data, offset + 2);
				if (blockLen === 11) {
					const appId = String.fromCharCode(...Array.from(data.subarray(offset + 3, offset + 14)));
					if (appId === 'NETSCAPE2.0' || appId === 'ANIMEXTS1.0') {
						const subBlockSize = byteAt(data, offset + 14);
						if (subBlockSize >= 3 && byteAt(data, offset + 15) === 1) {
							loopCount = readUint16LE(data, offset + 16);
						}
					}
				}
				offset += 2;
			} else if (extLabel === 0xfe) {
				// Comment Extension
				offset += 2;
				let comment = '';
				while (offset < data.length) {
					const blockSize = byteAt(data, offset);
					offset++;
					if (blockSize === 0) break;
					for (let i = 0; i < blockSize && offset + i < data.length; i++) {
						comment += String.fromCharCode(byteAt(data, offset + i));
					}
					offset += blockSize;
				}
				if (comment.trim()) comments.push(comment.trim());
				continue;
			} else {
				offset += 2;
			}

			// Skip sub-blocks
			while (offset < data.length) {
				const blockSize = byteAt(data, offset);
				offset++;
				if (blockSize === 0) break;
				offset += blockSize;
			}
			continue;
		}

		// Unknown block, skip ahead
		offset++;
	}

	if (minDelay === Infinity) minDelay = 0;

	return {
		version: `GIF${version}`,
		width,
		height,
		frames: frameCount,
		globalColorTable: hasGCT,
		globalColorTableSize: gctSize > 0 ? gctSize / 3 : 0,
		backgroundColorIndex,
		loopCount,
		totalDuration: totalDelay,
		minFrameDelay: minDelay,
		maxFrameDelay: maxDelay,
		avgFrameDelay: frameCount > 0 ? Math.round(totalDelay / frameCount) : 0,
		hasTransparency,
		commentExtensions: comments,
		fileSize: file.size,
	};
}

export function GifAnalyzerPanel({ file }: GifAnalyzerPanelProps) {
	const [analysis, setAnalysis] = useState<GifAnalysis | null>(null);
	const [analyzing, setAnalyzing] = useState(false);

	const handleAnalyze = useCallback(async () => {
		if (!file) return;
		setAnalyzing(true);
		try {
			const result = await analyzeGif(file);
			setAnalysis(result);
			toast.success('GIF analyzed');
		} catch (err) {
			toast.error(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		} finally {
			setAnalyzing(false);
		}
	}, [file]);

	return (
		<>
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					GIF Analyzer
				</h3>
				<p className="text-[12px] text-text-tertiary mb-3">
					Inspect the internal structure of a GIF file: frames, color tables, timing, metadata.
				</p>
				<Button
					variant="secondary"
					className="w-full"
					disabled={!file || analyzing}
					onClick={() => {
						void handleAnalyze();
					}}
				>
					{analyzing ? 'Analyzing…' : 'Analyze GIF'}
				</Button>
				{!file && <p className="text-[12px] text-text-tertiary mt-2">Load a GIF file first</p>}
			</div>

			{analysis && (
				<>
					{/* General */}
					<div>
						<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
							General
						</h3>
						<AnalysisTable
							rows={[
								['Format', analysis.version],
								['Dimensions', `${analysis.width}×${analysis.height}px`],
								['File Size', formatFileSize(analysis.fileSize)],
								['Frames', String(analysis.frames)],
								[
									'Loop Count',
									analysis.loopCount === null
										? 'Not set (play once)'
										: analysis.loopCount === 0
											? 'Infinite'
											: `${analysis.loopCount}×`,
								],
							]}
						/>
					</div>

					{/* Timing */}
					<div>
						<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
							Timing
						</h3>
						<AnalysisTable
							rows={[
								['Total Duration', `${(analysis.totalDuration / 1000).toFixed(2)}s`],
								['Avg Frame Delay', `${analysis.avgFrameDelay}ms`],
								['Min Frame Delay', `${analysis.minFrameDelay}ms`],
								['Max Frame Delay', `${analysis.maxFrameDelay}ms`],
								[
									'Effective FPS',
									analysis.avgFrameDelay > 0
										? `~${(1000 / analysis.avgFrameDelay).toFixed(1)}`
										: 'N/A',
								],
							]}
						/>
					</div>

					{/* Color Table */}
					<div>
						<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
							Color Table
						</h3>
						<AnalysisTable
							rows={[
								['Global Color Table', analysis.globalColorTable ? 'Yes' : 'No'],
								[
									'Global Colors',
									analysis.globalColorTableSize > 0 ? String(analysis.globalColorTableSize) : 'None',
								],
								['Background Color Index', String(analysis.backgroundColorIndex)],
								['Has Transparency', analysis.hasTransparency ? 'Yes' : 'No'],
							]}
						/>
					</div>

					{/* Comments */}
					{analysis.commentExtensions.length > 0 && (
						<div>
							<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
								Comments
							</h3>
							{analysis.commentExtensions.map((c, i) => (
								<div
									key={i}
									className="rounded-md bg-surface-raised/50 border border-border/50 px-3 py-2 mb-1.5"
								>
									<p className="text-[12px] text-text-secondary font-mono break-all">{c}</p>
								</div>
							))}
						</div>
					)}
				</>
			)}
		</>
	);
}

function AnalysisTable({ rows }: { rows: [string, string][] }) {
	return (
		<div className="rounded-lg bg-surface-raised/50 border border-border/50 overflow-hidden">
			{rows.map(([label, value], i) => (
				<div
					key={label}
					className={`flex justify-between px-3 py-1.5 ${i < rows.length - 1 ? 'border-b border-border/30' : ''}`}
				>
					<span className="text-[12px] text-text-tertiary">{label}</span>
					<span className="text-[12px] text-text font-mono tabular-nums">{value}</span>
				</div>
			))}
		</div>
	);
}
