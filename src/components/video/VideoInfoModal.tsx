import { X, FileText, Film, AudioLines, Subtitles } from 'lucide-react';
import type { ProbeResult, StreamInfo } from '@/stores/videoEditor.ts';
import { formatFileSize } from '@/utils/format.ts';

interface VideoInfoModalProps {
	file: File;
	probeResult: ProbeResult | null;
	duration: number;
	onClose: () => void;
}

function StreamSection({ icon: Icon, label, streams }: { icon: typeof Film; label: string; streams: StreamInfo[] }) {
	if (streams.length === 0) return null;
	return (
		<div>
			<div className="flex items-center gap-2 mb-2">
				<Icon size={13} className="text-accent" />
				<span className="text-[12px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</span>
			</div>
			<div className="flex flex-col gap-2">
				{streams.map((s) => (
					<div key={s.index} className="rounded-lg bg-bg/50 px-3 py-2 flex flex-col gap-1">
						<div className="flex justify-between text-[13px]">
							<span className="text-text-tertiary">Codec</span>
							<span className="font-mono text-text-secondary">{s.codec}</span>
						</div>
						{s.type === 'video' && s.width && s.height && (
							<div className="flex justify-between text-[13px]">
								<span className="text-text-tertiary">Resolution</span>
								<span className="font-mono text-text-secondary">
									{s.width}&times;{s.height}
								</span>
							</div>
						)}
						{s.type === 'video' && s.fps && (
							<div className="flex justify-between text-[13px]">
								<span className="text-text-tertiary">Frame rate</span>
								<span className="font-mono text-text-secondary">{s.fps} fps</span>
							</div>
						)}
						{s.type === 'audio' && s.sampleRate && (
							<div className="flex justify-between text-[13px]">
								<span className="text-text-tertiary">Sample rate</span>
								<span className="font-mono text-text-secondary">{s.sampleRate} Hz</span>
							</div>
						)}
						{s.type === 'audio' && s.channels && (
							<div className="flex justify-between text-[13px]">
								<span className="text-text-tertiary">Channels</span>
								<span className="font-mono text-text-secondary">
									{s.channels === 1 ? 'Mono' : s.channels === 2 ? 'Stereo' : `${s.channels}ch`}
								</span>
							</div>
						)}
						{s.language && (
							<div className="flex justify-between text-[13px]">
								<span className="text-text-tertiary">Language</span>
								<span className="font-mono text-text-secondary">{s.language}</span>
							</div>
						)}
						{s.bitrate && (
							<div className="flex justify-between text-[13px]">
								<span className="text-text-tertiary">Bitrate</span>
								<span className="font-mono text-text-secondary">{s.bitrate} kb/s</span>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

export function VideoInfoModal({ file, probeResult, duration, onClose }: VideoInfoModalProps) {
	const lastModified = new Date(file.lastModified).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});

	const videoStreams = probeResult?.streams.filter((s) => s.type === 'video') ?? [];
	const audioStreams = probeResult?.streams.filter((s) => s.type === 'audio') ?? [];
	const subtitleStreams = probeResult?.streams.filter((s) => s.type === 'subtitle') ?? [];

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-lg mx-4 rounded-2xl border border-border bg-surface p-5 sm:p-6 animate-scale-in shadow-2xl max-h-[85vh] overflow-y-auto">
				<button
					onClick={onClose}
					className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-raised/60 transition-colors cursor-pointer"
				>
					<X size={16} />
				</button>

				<div className="flex items-center gap-3 mb-5">
					<div className="h-10 w-10 rounded-xl gradient-accent flex items-center justify-center">
						<FileText size={20} className="text-white" />
					</div>
					<h2 className="text-base font-bold">File Info</h2>
				</div>

				{/* General */}
				<div className="flex flex-col gap-2 mb-4">
					<div className="flex justify-between text-[13px]">
						<span className="text-text-tertiary">File name</span>
						<span className="font-mono text-text-secondary text-right break-all max-w-[60%]">
							{file.name}
						</span>
					</div>
					<div className="flex justify-between text-[13px]">
						<span className="text-text-tertiary">File size</span>
						<span className="font-mono text-text-secondary">{formatFileSize(file.size)}</span>
					</div>
					<div className="flex justify-between text-[13px]">
						<span className="text-text-tertiary">Type</span>
						<span className="font-mono text-text-secondary">{file.type || 'Unknown'}</span>
					</div>
					{probeResult?.format && (
						<div className="flex justify-between text-[13px]">
							<span className="text-text-tertiary">Format</span>
							<span className="font-mono text-text-secondary">{probeResult.format}</span>
						</div>
					)}
					{duration > 0 && (
						<div className="flex justify-between text-[13px]">
							<span className="text-text-tertiary">Duration</span>
							<span className="font-mono text-text-secondary">{duration.toFixed(2)}s</span>
						</div>
					)}
					{probeResult && probeResult.bitrate > 0 && (
						<div className="flex justify-between text-[13px]">
							<span className="text-text-tertiary">Bitrate</span>
							<span className="font-mono text-text-secondary">{probeResult.bitrate} kb/s</span>
						</div>
					)}
					<div className="flex justify-between text-[13px]">
						<span className="text-text-tertiary">Last modified</span>
						<span className="font-mono text-text-secondary">{lastModified}</span>
					</div>
				</div>

				{/* Streams */}
				<div className="flex flex-col gap-4">
					<StreamSection icon={Film} label="Video Streams" streams={videoStreams} />
					<StreamSection icon={AudioLines} label="Audio Streams" streams={audioStreams} />
					<StreamSection icon={Subtitles} label="Subtitle Streams" streams={subtitleStreams} />
				</div>

				{!probeResult && (
					<p className="text-[13px] text-text-tertiary mt-2">
						Stream details will appear once FFmpeg finishes probing.
					</p>
				)}
			</div>
		</div>
	);
}
