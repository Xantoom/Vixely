import { AlertCircle, AudioLines, FileText, Film, LoaderCircle, Subtitles, X } from 'lucide-react';
import type { ProbeResult, StreamInfo } from '@/stores/videoEditor.ts';
import type { DetailedProbeResultData, DetailedProbeStreamInfo } from '@/workers/ffmpeg-worker.ts';
import { formatDimensions, formatFileSize } from '@/utils/format.ts';

interface VideoInfoModalProps {
	file: File;
	probeResult: ProbeResult | null;
	duration: number;
	streamInfoPending?: boolean;
	metadataLoadStage?: 'idle' | 'fast-probe' | 'fonts' | 'ready' | 'error';
	detailedProbe?: DetailedProbeResultData | null;
	detailedProbePending?: boolean;
	detailedProbeError?: string | null;
	onClose: () => void;
}

function fractionToNumber(raw?: string): number | null {
	if (!raw) return null;
	if (!raw.includes('/')) {
		const value = Number(raw);
		return Number.isFinite(value) ? value : null;
	}
	const [numRaw, denRaw] = raw.split('/');
	const num = Number(numRaw);
	const den = Number(denRaw);
	if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
	return num / den;
}

function toNumber(raw?: string): number | null {
	if (!raw) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

function formatDuration(seconds: number | null): string {
	if (!seconds || seconds <= 0) return 'Unknown';
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h ${m}m ${s}s`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

function formatFps(value: number | null): string {
	if (!value || !Number.isFinite(value) || value <= 0) return 'Unknown';
	return `${value.toFixed(value >= 100 ? 1 : 2)} fps`;
}

function formatBitrate(rawBps?: string, kbps?: number): string {
	if (rawBps) {
		const value = Number(rawBps);
		if (Number.isFinite(value) && value > 0) return `${Math.round(value / 1000).toLocaleString()} kb/s`;
	}
	if (kbps && kbps > 0) return `${Math.round(kbps).toLocaleString()} kb/s`;
	return '-';
}

function codecLabel(codec?: string): string {
	if (!codec) return 'Unknown';
	const normalized = codec.trim().toLowerCase();
	const map: Record<string, string> = {
		hevc: 'H.265',
		h264: 'H.264',
		avc: 'H.264',
		av1: 'AV1',
		vp9: 'VP9',
		aac: 'AAC',
		opus: 'Opus',
		ac3: 'AC-3',
		eac3: 'E-AC-3',
		flac: 'FLAC',
		mp3: 'MP3',
		ass: 'ASS',
		subrip: 'SRT',
		webvtt: 'WebVTT',
	};
	return map[normalized] ?? codec.toUpperCase();
}

const LANG_NAMES: Record<string, string> = {
	en: 'English',
	eng: 'English',
	fr: 'French',
	fre: 'French',
	fra: 'French',
	de: 'German',
	deu: 'German',
	ger: 'German',
	es: 'Spanish',
	spa: 'Spanish',
	it: 'Italian',
	ita: 'Italian',
	ja: 'Japanese',
	jpn: 'Japanese',
	zh: 'Chinese',
	zho: 'Chinese',
	chi: 'Chinese',
	ko: 'Korean',
	kor: 'Korean',
	pt: 'Portuguese',
	por: 'Portuguese',
	ru: 'Russian',
	rus: 'Russian',
	ar: 'Arabic',
	ara: 'Arabic',
	hi: 'Hindi',
	hin: 'Hindi',
	pl: 'Polish',
	pol: 'Polish',
	tr: 'Turkish',
	tur: 'Turkish',
	nl: 'Dutch',
	nld: 'Dutch',
	dut: 'Dutch',
	sv: 'Swedish',
	swe: 'Swedish',
	no: 'Norwegian',
	nor: 'Norwegian',
	da: 'Danish',
	dan: 'Danish',
	fi: 'Finnish',
	fin: 'Finnish',
	cs: 'Czech',
	ces: 'Czech',
	cze: 'Czech',
	hu: 'Hungarian',
	hun: 'Hungarian',
	ro: 'Romanian',
	ron: 'Romanian',
	rum: 'Romanian',
	th: 'Thai',
	tha: 'Thai',
	vi: 'Vietnamese',
	vie: 'Vietnamese',
};

function formatLabelFromDetailed(stream: DetailedProbeStreamInfo | undefined): string {
	const longName = stream?.codec_long_name?.trim();
	if (longName) return longName;
	const shortName = stream?.codec_name?.trim();
	if (shortName) return shortName.toUpperCase();
	return 'Unknown';
}

function languageLabel(stream: StreamInfo): string {
	if (stream.language && stream.language.trim()) {
		const normalized = stream.language.trim().toLowerCase();
		if (normalized === 'und' || normalized === 'unk') return 'Undetermined';
		return LANG_NAMES[normalized] ?? stream.language.trim().toUpperCase();
	}
	if (stream.title && stream.title.trim()) return stream.title;
	return 'Undetermined';
}

function channelLabel(channels?: number): string {
	if (!channels || channels <= 0) return '-';
	if (channels === 1) return 'Mono';
	if (channels === 2) return 'Stereo';
	if (channels === 6) return '5.1';
	if (channels === 8) return '7.1';
	return `${channels}ch`;
}

function getDetailedVideoStream(
	detailedProbe: DetailedProbeResultData | null | undefined,
): DetailedProbeStreamInfo | null {
	return detailedProbe?.streams.find((stream) => stream.codec_type === 'video') ?? null;
}

function buildDetailedTrackMap(
	detailedProbe: DetailedProbeResultData | null | undefined,
): Map<number, DetailedProbeStreamInfo> {
	const map = new Map<number, DetailedProbeStreamInfo>();
	for (const stream of detailedProbe?.streams ?? []) {
		if (stream.codec_type !== 'video' && stream.codec_type !== 'audio' && stream.codec_type !== 'subtitle')
			continue;
		if (typeof stream.index !== 'number') continue;
		map.set(stream.index, stream);
	}
	return map;
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-border/70 bg-bg/35 px-3 py-2.5">
			<p className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary">{label}</p>
			<p className="mt-1 text-[15px] font-semibold text-text">{value}</p>
		</div>
	);
}

function Pill({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center rounded-full border border-border/70 bg-bg/40 px-2 py-0.5 text-[11px] text-text-secondary">
			{children}
		</span>
	);
}

function FactChip({ label, value }: { label: string; value: string }) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-bg/30 px-2.5 py-1 text-[12px] text-text-secondary">
			<span className="text-text-tertiary">{label}:</span>
			<span className="font-medium text-text">{value}</span>
		</span>
	);
}

function VideoDetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-start justify-between gap-3 text-[13px]">
			<span className="text-text-tertiary">{label}</span>
			<span className="max-w-[70%] break-all text-right text-text-secondary">{value}</span>
		</div>
	);
}

function AudioTracksTable({
	streams,
	detailedMap,
}: {
	streams: StreamInfo[];
	detailedMap: Map<number, DetailedProbeStreamInfo>;
}) {
	if (streams.length === 0) {
		return <p className="text-[13px] text-text-tertiary">No audio tracks</p>;
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-border/70 bg-bg/35">
			<div className="max-h-64 overflow-y-auto">
				<table className="w-full min-w-[860px] table-fixed text-[12px]">
					<thead className="sticky top-0 z-10 bg-surface-raised/90 backdrop-blur-sm">
						<tr className="text-left text-text-tertiary">
							<th className="px-3 py-2 font-medium w-14">#</th>
							<th className="px-3 py-2 font-medium">Language</th>
							<th className="px-3 py-2 font-medium">Format</th>
							<th className="px-3 py-2 font-medium">Codec</th>
							<th className="px-3 py-2 font-medium">Bitrate</th>
							<th className="px-3 py-2 font-medium">Channels</th>
							<th className="px-3 py-2 font-medium">Flags</th>
						</tr>
					</thead>
					<tbody>
						{streams.map((stream, idx) => {
							const detailed = detailedMap.get(stream.index);
							const flags = [stream.isDefault ? 'Default' : null, stream.isForced ? 'Forced' : null]
								.filter(Boolean)
								.join(', ');
							return (
								<tr
									key={`audio-${stream.index}`}
									className={idx % 2 === 0 ? 'bg-transparent' : 'bg-bg/20'}
								>
									<td className="px-3 py-2 text-text-tertiary">{idx + 1}</td>
									<td className="px-3 py-2 text-text-secondary truncate">{languageLabel(stream)}</td>
									<td className="px-3 py-2 text-text-secondary truncate">
										{formatLabelFromDetailed(detailed)}
									</td>
									<td className="px-3 py-2 text-text">{codecLabel(stream.codec)}</td>
									<td className="px-3 py-2 text-text">
										{formatBitrate(detailed?.bit_rate, stream.bitrate)}
									</td>
									<td className="px-3 py-2 text-text">{channelLabel(stream.channels)}</td>
									<td className="px-3 py-2 text-text-tertiary">{flags || '-'}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function SubtitleTracksTable({
	streams,
	detailedMap,
}: {
	streams: StreamInfo[];
	detailedMap: Map<number, DetailedProbeStreamInfo>;
}) {
	if (streams.length === 0) {
		return <p className="text-[13px] text-text-tertiary">No subtitle tracks</p>;
	}

	return (
		<div className="overflow-x-auto rounded-xl border border-border/70 bg-bg/35">
			<div className="max-h-64 overflow-y-auto">
				<table className="w-full min-w-[760px] table-fixed text-[12px]">
					<thead className="sticky top-0 z-10 bg-surface-raised/90 backdrop-blur-sm">
						<tr className="text-left text-text-tertiary">
							<th className="px-3 py-2 font-medium w-14">#</th>
							<th className="px-3 py-2 font-medium">Language</th>
							<th className="px-3 py-2 font-medium">Format</th>
							<th className="px-3 py-2 font-medium">Codec</th>
							<th className="px-3 py-2 font-medium">Flags</th>
						</tr>
					</thead>
					<tbody>
						{streams.map((stream, idx) => {
							const detailed = detailedMap.get(stream.index);
							const flags = [stream.isDefault ? 'Default' : null, stream.isForced ? 'Forced' : null]
								.filter(Boolean)
								.join(', ');
							return (
								<tr
									key={`subtitle-${stream.index}`}
									className={idx % 2 === 0 ? 'bg-transparent' : 'bg-bg/20'}
								>
									<td className="px-3 py-2 text-text-tertiary">{idx + 1}</td>
									<td className="px-3 py-2 text-text-secondary truncate">{languageLabel(stream)}</td>
									<td className="px-3 py-2 text-text-secondary truncate">
										{formatLabelFromDetailed(detailed)}
									</td>
									<td className="px-3 py-2 text-text">{codecLabel(stream.codec)}</td>
									<td className="px-3 py-2 text-text-tertiary">{flags || '-'}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export function VideoInfoModal({
	file,
	probeResult,
	duration,
	streamInfoPending = false,
	metadataLoadStage = 'idle',
	detailedProbe,
	detailedProbePending = false,
	detailedProbeError = null,
	onClose,
}: VideoInfoModalProps) {
	const videoStreams = probeResult?.streams.filter((stream) => stream.type === 'video') ?? [];
	const audioStreams = probeResult?.streams.filter((stream) => stream.type === 'audio') ?? [];
	const subtitleStreams = probeResult?.streams.filter((stream) => stream.type === 'subtitle') ?? [];
	const primaryVideo = videoStreams[0] ?? null;
	const detailedVideo = getDetailedVideoStream(detailedProbe);
	const detailedTrackMap = buildDetailedTrackMap(detailedProbe);

	const resolvedDuration = duration > 0 ? duration : (toNumber(detailedProbe?.format.duration) ?? null);
	const resolvedFps = primaryVideo?.fps ?? fractionToNumber(detailedVideo?.avg_frame_rate) ?? null;
	const resolvedResolution =
		primaryVideo?.width && primaryVideo?.height
			? formatDimensions(primaryVideo.width, primaryVideo.height)
			: detailedVideo?.width && detailedVideo?.height
				? formatDimensions(detailedVideo.width, detailedVideo.height)
				: 'Unknown';
	const resolvedVideoCodec = codecLabel(primaryVideo?.codec ?? detailedVideo?.codec_name ?? undefined);
	const resolvedBitrate = formatBitrate(detailedProbe?.format.bit_rate, probeResult?.bitrate);
	const formatLabel =
		detailedProbe?.format.format_long_name ??
		detailedProbe?.format.format_name ??
		probeResult?.format ??
		(file.type.trim() || 'Unknown');

	const loadingLabel =
		metadataLoadStage === 'fonts'
			? 'Extracting subtitle fonts'
			: metadataLoadStage === 'fast-probe'
				? 'Reading stream map'
				: 'Loading metadata';

	const lastModified = new Date(file.lastModified).toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="media-metadata-title"
		>
			<div className="relative mx-4 w-full max-w-5xl overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-2xl">
				<div className="pointer-events-none absolute -top-24 -left-16 h-52 w-52 rounded-full bg-accent/15 blur-3xl" />
				<div className="pointer-events-none absolute -right-16 bottom-0 h-44 w-44 rounded-full bg-accent/10 blur-3xl" />

				<div className="relative border-b border-border/70 px-5 py-4 sm:px-6">
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-bg/40 px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
								<FileText size={12} />
								Metadata
							</div>
							<h2 id="media-metadata-title" className="mt-2 text-lg font-semibold text-text">
								Media Metadata
							</h2>
							<p className="mt-0.5 max-w-full break-all text-sm text-text-tertiary" title={file.name}>
								{file.name}
							</p>
						</div>

						<button
							onClick={onClose}
							className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-raised/70 hover:text-text cursor-pointer"
							title="Close"
						>
							<X size={15} />
						</button>
					</div>

					{(streamInfoPending || detailedProbePending) && (
						<div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[12px] text-accent">
							<LoaderCircle size={12} className="animate-spin" />
							{loadingLabel}
						</div>
					)}

					{detailedProbeError && (
						<div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[12px] text-warning">
							<AlertCircle size={12} />
							Some details could not be read
						</div>
					)}
				</div>

				<div className="relative max-h-[76vh] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
					<div className="rounded-2xl border border-border/70 bg-surface-raised/35 p-4">
						<p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
							Overview
						</p>
						<div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
							<OverviewMetric label="Duration" value={formatDuration(resolvedDuration)} />
							<OverviewMetric label="Resolution" value={resolvedResolution} />
							<OverviewMetric label="Frame Rate" value={formatFps(resolvedFps)} />
						</div>
						<div className="mt-3 flex flex-wrap gap-2">
							<FactChip label="Video codec" value={resolvedVideoCodec} />
							<FactChip label="Bitrate" value={resolvedBitrate} />
							<FactChip
								label="Tracks"
								value={`${audioStreams.length} audio / ${subtitleStreams.length} subtitles`}
							/>
						</div>
					</div>

					<div className="mt-4 rounded-2xl border border-border/70 bg-surface-raised/35 p-4">
						<div className="mb-2 flex items-center gap-2">
							<Film size={14} className="text-accent" />
							<h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
								Video
							</h3>
							<Pill>{codecLabel(primaryVideo?.codec ?? detailedVideo?.codec_name)}</Pill>
						</div>
						<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
							<div className="rounded-xl border border-border/70 bg-bg/35 p-3">
								<p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
									Source File
								</p>
								<div className="space-y-1.5">
									<VideoDetailRow label="Name" value={file.name} />
									<VideoDetailRow label="Format" value={formatLabel} />
									<VideoDetailRow label="Type" value={file.type || 'Unknown'} />
									<VideoDetailRow label="Size" value={formatFileSize(file.size)} />
									<VideoDetailRow label="Modified" value={lastModified} />
								</div>
							</div>
							<div className="rounded-xl border border-border/70 bg-bg/35 p-3">
								<p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
									Playback Profile
								</p>
								<div className="space-y-1.5">
									<VideoDetailRow label="Codec" value={resolvedVideoCodec} />
									<VideoDetailRow label="Resolution" value={resolvedResolution} />
									<VideoDetailRow label="Frame rate" value={formatFps(resolvedFps)} />
									<VideoDetailRow label="Bitrate" value={resolvedBitrate} />
									<VideoDetailRow label="Duration" value={formatDuration(resolvedDuration)} />
								</div>
							</div>
						</div>
					</div>

					<div className="mt-4 rounded-2xl border border-border/70 bg-surface-raised/35 p-4">
						<div className="mb-2 flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<AudioLines size={14} className="text-accent" />
								<h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
									Audio Tracks
								</h3>
							</div>
							<Pill>{audioStreams.length}</Pill>
						</div>
						<AudioTracksTable streams={audioStreams} detailedMap={detailedTrackMap} />
					</div>

					<div className="mt-4 rounded-2xl border border-border/70 bg-surface-raised/35 p-4">
						<div className="mb-2 flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Subtitles size={14} className="text-accent" />
								<h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
									Subtitle Tracks
								</h3>
							</div>
							<Pill>{subtitleStreams.length}</Pill>
						</div>
						<SubtitleTracksTable streams={subtitleStreams} detailedMap={detailedTrackMap} />
					</div>
				</div>
			</div>
		</div>
	);
}
