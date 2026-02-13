import { X, Download, CheckCircle2, Copy } from 'lucide-react';
import type { ExportStats } from '@/hooks/useVideoProcessor.ts';
import { Button } from '@/components/ui/index.ts';
import { formatFileSize } from '@/utils/format.ts';

interface ExportModalProps {
	open: boolean;
	progress: number;
	stats: ExportStats;
	isStreamCopy: boolean;
	resultSize: number | null;
	onCancel: () => void;
	onDownload: () => void;
	onClose: () => void;
}

function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rem = s % 60;
	return `${m}m ${rem.toString().padStart(2, '0')}s`;
}

function formatEta(progress: number, elapsedMs: number): string {
	if (progress <= 0 || progress >= 1 || elapsedMs < 1000) return '--';
	const totalEstimate = elapsedMs / progress;
	const remaining = totalEstimate - elapsedMs;
	return formatElapsed(remaining);
}

const RING_SIZE = 140;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ExportModal({
	open,
	progress,
	stats,
	isStreamCopy,
	resultSize,
	onCancel,
	onDownload,
	onClose,
}: ExportModalProps) {
	if (!open) return null;

	const done = resultSize !== null;
	const pct = Math.round((done ? 1 : progress) * 100);
	const offset = CIRCUMFERENCE - (done ? 1 : progress) * CIRCUMFERENCE;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-sm mx-4 rounded-2xl border border-border bg-surface p-6 animate-scale-in shadow-2xl">
				<button
					onClick={done ? onClose : undefined}
					disabled={!done}
					className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer disabled:opacity-0 disabled:pointer-events-none"
				>
					<X size={16} />
				</button>

				<h2 className="text-base font-bold mb-6">{done ? 'Export Complete' : 'Exporting...'}</h2>

				{/* Progress ring */}
				<div className="flex justify-center mb-6">
					<div className="relative">
						<svg
							width={RING_SIZE}
							height={RING_SIZE}
							viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
							className="-rotate-90"
						>
							<circle
								cx={RING_SIZE / 2}
								cy={RING_SIZE / 2}
								r={RADIUS}
								fill="none"
								stroke="var(--color-border)"
								strokeWidth={STROKE_WIDTH}
							/>
							<circle
								cx={RING_SIZE / 2}
								cy={RING_SIZE / 2}
								r={RADIUS}
								fill="none"
								stroke={done ? 'var(--color-success)' : 'var(--color-accent)'}
								strokeWidth={STROKE_WIDTH}
								strokeLinecap="round"
								strokeDasharray={CIRCUMFERENCE}
								strokeDashoffset={offset}
								className="transition-[stroke-dashoffset] duration-300"
							/>
						</svg>
						<div className="absolute inset-0 flex flex-col items-center justify-center">
							{done ? (
								<CheckCircle2 size={32} className="text-success" />
							) : (
								<span className="text-2xl font-bold font-mono tabular-nums">{pct}%</span>
							)}
						</div>
					</div>
				</div>

				{/* Stream copy badge */}
				{isStreamCopy && !done && (
					<div className="flex justify-center mb-4">
						<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10 border border-success/20 text-xs font-semibold text-success">
							<Copy size={11} />
							Stream Copy
						</span>
					</div>
				)}

				{/* Stats grid */}
				{!done ? (
					<div className="grid grid-cols-2 gap-px bg-border/50 rounded-lg overflow-hidden mb-6">
						<StatCell label="FPS" value={stats.fps > 0 ? stats.fps.toFixed(1) : '--'} />
						<StatCell label="Frames" value={stats.frame > 0 ? String(stats.frame) : '--'} />
						<StatCell label="Speed" value={stats.speed > 0 ? `${stats.speed.toFixed(1)}x` : '--'} />
						<StatCell
							label="Elapsed"
							value={stats.elapsedMs > 500 ? formatElapsed(stats.elapsedMs) : '--'}
						/>
						<StatCell label="ETA" value={formatEta(progress, stats.elapsedMs)} span={2} />
					</div>
				) : (
					<div className="rounded-lg bg-bg/50 p-3 flex flex-col gap-1.5 mb-6">
						<div className="flex justify-between text-sm">
							<span className="text-text-tertiary">File size</span>
							<span className="font-mono text-text-secondary">{formatFileSize(resultSize)}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-text-tertiary">Time</span>
							<span className="font-mono text-text-secondary">{formatElapsed(stats.elapsedMs)}</span>
						</div>
						{isStreamCopy && (
							<div className="flex justify-between text-sm">
								<span className="text-text-tertiary">Method</span>
								<span className="font-mono text-success">Stream copy</span>
							</div>
						)}
					</div>
				)}

				{/* Actions */}
				{done ? (
					<div className="flex flex-col gap-2">
						<Button className="w-full" onClick={onDownload}>
							<Download size={16} />
							Download
						</Button>
						<Button variant="ghost" className="w-full" onClick={onClose}>
							Close
						</Button>
					</div>
				) : (
					<Button variant="danger" className="w-full" onClick={onCancel}>
						Cancel
					</Button>
				)}
			</div>
		</div>
	);
}

function StatCell({ label, value, span }: { label: string; value: string; span?: number }) {
	return (
		<div className={`bg-surface px-3 py-2.5 flex flex-col items-center gap-0.5 ${span === 2 ? 'col-span-2' : ''}`}>
			<span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</span>
			<span className="text-sm font-mono font-medium tabular-nums text-text">{value}</span>
		</div>
	);
}
