import { X, FileText, Film, AudioLines, Subtitles, LoaderCircle, AlertCircle, Paperclip } from 'lucide-react';
import type { ProbeResult, StreamInfo } from '@/stores/videoEditor.ts';
import type { DetailedProbeResultData, DetailedProbeStreamInfo } from '@/workers/ffmpeg-worker.ts';
import { formatFileSize, formatDimensions, formatNumber } from '@/utils/format.ts';

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
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	}
	const [numRaw, denRaw] = raw.split('/');
	const num = Number(numRaw);
	const den = Number(denRaw);
	if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
	return num / den;
}

function formatLocalizedNumber(value: number, maximumFractionDigits = 0): string {
	if (!Number.isFinite(value)) return '';
	if (maximumFractionDigits <= 0) return formatNumber(Math.round(value), 0);
	return value.toLocaleString(undefined, { maximumFractionDigits });
}

function formatLocalizedFromRaw(raw?: string, maximumFractionDigits = 0): string | null {
	if (!raw) return null;
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	return formatLocalizedNumber(n, maximumFractionDigits);
}

function formatBitrateKbps(raw?: string): string | null {
	if (!raw) return null;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return null;
	return `${formatLocalizedNumber(Math.round(n / 1000), 0)} kb/s`;
}

function formatSeconds(raw?: string): string | null {
	if (!raw) return null;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return null;
	const totalSec = Math.floor(n);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0)
		return `${formatLocalizedNumber(h, 0)} h ${formatLocalizedNumber(m, 0)} min ${formatLocalizedNumber(s, 0)} s`;
	if (m > 0) return `${formatLocalizedNumber(m, 0)} min ${formatLocalizedNumber(s, 0)} s`;
	return `${formatLocalizedNumber(s, 0)} s`;
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
	if (!value) return null;
	return (
		<div className="flex justify-between text-[14px] gap-4">
			<span className="text-text-tertiary">{label}</span>
			<span className="font-mono text-text-secondary text-right break-all">{value}</span>
		</div>
	);
}

function labelFromKey(key: string): string {
	return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function valueToDisplay(value: unknown): string | null {
	if (typeof value === 'string') return value || null;
	if (typeof value === 'number') return Number.isFinite(value) ? formatLocalizedNumber(value, 3) : null;
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	return null;
}

function isTechnicalStatsTag(key: string): boolean {
	const normalized = key.toUpperCase();
	if (normalized.startsWith('_STATISTICS_') || normalized.startsWith('STATISTICS_')) return true;
	return /^(BPS|DURATION|NUMBER_OF_FRAMES|NUMBER_OF_BYTES)(-|$)/.test(normalized);
}

function getTagValue(tags: Record<string, string> | undefined, key: string): string | null {
	if (!tags) return null;
	const exact = tags[key];
	if (typeof exact === 'string' && exact) return exact;
	const found = Object.entries(tags).find(([k]) => k.toLowerCase() === key.toLowerCase());
	if (!found) return null;
	return found[1] || null;
}

function sanitizeCodecLabel(value: string | null | undefined): string | null {
	if (!value) return null;
	const cleaned = value.replace(/[,\s]+$/g, '').trim();
	return cleaned || null;
}

function isAttachmentLikeStream(stream: DetailedProbeStreamInfo): boolean {
	const mimetype = getTagValue(stream.tags, 'mimetype')?.toLowerCase();
	if (stream.codec_type === 'attachment') return true;
	if (stream.disposition?.attached_pic === 1) return true;
	if (mimetype?.startsWith('image/')) return true;
	return false;
}

function StreamSection({ icon: Icon, label, streams }: { icon: typeof Film; label: string; streams: StreamInfo[] }) {
	if (streams.length === 0) return null;
	return (
		<div>
			<div className="flex items-center gap-2 mb-2">
				<Icon size={13} className="text-accent" />
				<span className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</span>
			</div>
			<div className="flex flex-col gap-2">
				{streams.map((s) => {
					const tagRows = Object.entries(s.tags ?? {}).filter(
						([k]) =>
							k.toLowerCase() !== 'language' && k.toLowerCase() !== 'title' && !isTechnicalStatsTag(k),
					);
					const dispositionRows = Object.entries(s.disposition ?? {}).filter(
						([k]) => k !== 'default' && k !== 'forced',
					);
					const language = s.language ?? getTagValue(s.tags, 'language');
					const title = s.title ?? getTagValue(s.tags, 'title');

					return (
						<div key={s.index} className="rounded-lg bg-bg/50 px-3 py-2 flex flex-col gap-1">
							<DetailRow label="Codec" value={sanitizeCodecLabel(s.codec)} />
							<DetailRow label="Title" value={title} />
							{s.type === 'video' && s.width && s.height && (
								<DetailRow label="Resolution" value={formatDimensions(s.width, s.height)} />
							)}
							{s.type === 'video' && s.fps && (
								<DetailRow label="Frame rate" value={`${formatLocalizedNumber(s.fps, 3)} fps`} />
							)}
							{s.type === 'audio' && s.sampleRate && (
								<DetailRow label="Sample rate" value={`${formatLocalizedNumber(s.sampleRate, 0)} Hz`} />
							)}
							{s.type === 'audio' && s.channels && (
								<DetailRow
									label="Channels"
									value={
										s.channels === 1
											? 'Mono'
											: s.channels === 2
												? 'Stereo'
												: `${formatLocalizedNumber(s.channels, 0)}ch`
									}
								/>
							)}
							<DetailRow label="Language" value={language} />
							{s.bitrate && (
								<DetailRow label="Bitrate" value={`${formatLocalizedNumber(s.bitrate, 0)} kb/s`} />
							)}
							<DetailRow
								label="Default"
								value={s.isDefault != null ? (s.isDefault ? 'Yes' : 'No') : null}
							/>
							<DetailRow label="Forced" value={s.isForced != null ? (s.isForced ? 'Yes' : 'No') : null} />
							{tagRows.map(([key, value]) => (
								<DetailRow key={`tag-${key}`} label={labelFromKey(key)} value={value} />
							))}
							{dispositionRows.map(([key, value]) => (
								<DetailRow
									key={`disp-${key}`}
									label={`Disposition ${labelFromKey(key)}`}
									value={valueToDisplay(value)}
								/>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function DetailedStreamCard({ stream }: { stream: DetailedProbeStreamInfo }) {
	const fps = fractionToNumber(stream.avg_frame_rate) ?? fractionToNumber(stream.r_frame_rate);
	const frameRateMode =
		stream.avg_frame_rate &&
		stream.r_frame_rate &&
		stream.avg_frame_rate !== '0/0' &&
		stream.r_frame_rate !== '0/0' &&
		stream.avg_frame_rate !== stream.r_frame_rate
			? 'Variable'
			: 'Constant';
	const defaultFlag = stream.disposition?.default === 1 ? 'Yes' : 'No';
	const forcedFlag = stream.disposition?.forced === 1 ? 'Yes' : 'No';
	const tagRows = Object.entries(stream.tags ?? {}).filter(
		([k]) => k.toLowerCase() !== 'language' && k.toLowerCase() !== 'title' && !isTechnicalStatsTag(k),
	);
	const dispositionRows = Object.entries(stream.disposition ?? {}).filter(([k]) => k !== 'default' && k !== 'forced');
	const language = getTagValue(stream.tags, 'language');
	const title = getTagValue(stream.tags, 'title');
	const knownKeys = new Set([
		'index',
		'codec_type',
		'codec_name',
		'codec_long_name',
		'profile',
		'codec_tag_string',
		'codec_tag',
		'width',
		'height',
		'display_aspect_ratio',
		'sample_aspect_ratio',
		'pix_fmt',
		'color_range',
		'color_space',
		'color_transfer',
		'color_primaries',
		'chroma_location',
		'bits_per_raw_sample',
		'field_order',
		'avg_frame_rate',
		'r_frame_rate',
		'sample_rate',
		'channels',
		'channel_layout',
		'bit_rate',
		'duration',
		'start_time',
		'tags',
		'disposition',
	]);
	const extraRows = Object.entries(stream)
		.filter(([key]) => !knownKeys.has(key))
		.map(([key, value]) => ({ key, value: valueToDisplay(value) }))
		.filter((row) => row.value != null);

	return (
		<div className="rounded-lg bg-bg/50 px-3 py-2 flex flex-col gap-1">
			<DetailRow label="ID" value={stream.index != null ? formatLocalizedNumber(stream.index + 1, 0) : null} />
			<DetailRow label="Type" value={stream.codec_type ?? null} />
			<DetailRow label="Format" value={sanitizeCodecLabel(stream.codec_long_name ?? stream.codec_name ?? null)} />
			<DetailRow label="Format profile" value={stream.profile ?? null} />
			<DetailRow label="Codec ID" value={stream.codec_tag_string ?? null} />
			<DetailRow label="Duration" value={formatSeconds(stream.duration)} />
			<DetailRow label="Bit rate" value={formatBitrateKbps(stream.bit_rate)} />
			{stream.codec_type === 'video' && (
				<>
					<DetailRow
						label="Resolution"
						value={stream.width && stream.height ? formatDimensions(stream.width, stream.height) : null}
					/>
					<DetailRow label="Display aspect ratio" value={stream.display_aspect_ratio} />
					<DetailRow label="Frame rate mode" value={frameRateMode} />
					<DetailRow label="Frame rate" value={fps != null ? `${formatLocalizedNumber(fps, 3)} fps` : null} />
					<DetailRow label="Color space" value={stream.color_space} />
					<DetailRow label="Chroma subsampling" value={stream.chroma_location} />
					<DetailRow
						label="Bit depth"
						value={
							formatLocalizedFromRaw(stream.bits_per_raw_sample, 0)
								? `${formatLocalizedFromRaw(stream.bits_per_raw_sample, 0)} bits`
								: null
						}
					/>
					<DetailRow label="Color range" value={stream.color_range} />
					<DetailRow label="Color primaries" value={stream.color_primaries} />
					<DetailRow label="Transfer characteristics" value={stream.color_transfer} />
					<DetailRow label="Matrix coefficients" value={stream.color_space} />
				</>
			)}
			{stream.codec_type === 'audio' && (
				<>
					<DetailRow
						label="Sampling rate"
						value={
							formatLocalizedFromRaw(stream.sample_rate, 0)
								? `${formatLocalizedFromRaw(stream.sample_rate, 0)} Hz`
								: null
						}
					/>
					<DetailRow
						label="Channels"
						value={stream.channels != null ? `${formatLocalizedNumber(stream.channels, 0)} channels` : null}
					/>
					<DetailRow label="Channel layout" value={stream.channel_layout} />
				</>
			)}
			<DetailRow label="Language" value={language} />
			<DetailRow label="Title" value={title} />
			<DetailRow label="Default" value={defaultFlag} />
			<DetailRow label="Forced" value={forcedFlag} />
			{tagRows.map(([key, value]) => (
				<DetailRow key={`tag-${key}`} label={labelFromKey(key)} value={value} />
			))}
			{dispositionRows.map(([key, value]) => (
				<DetailRow
					key={`disp-${key}`}
					label={`Disposition ${labelFromKey(key)}`}
					value={valueToDisplay(value)}
				/>
			))}
			{extraRows.map((row) => (
				<DetailRow key={`extra-${row.key}`} label={labelFromKey(row.key)} value={row.value} />
			))}
		</div>
	);
}

function AttachmentCard({ stream }: { stream: DetailedProbeStreamInfo }) {
	const filename = getTagValue(stream.tags, 'filename');
	const mimetype = getTagValue(stream.tags, 'mimetype');
	const title = getTagValue(stream.tags, 'title');
	const kind =
		stream.disposition?.attached_pic === 1 || mimetype?.toLowerCase().startsWith('image/') ? 'Cover' : 'Attachment';

	return (
		<div className="rounded-lg bg-bg/50 px-3 py-2 flex flex-col gap-1">
			<DetailRow label="ID" value={stream.index != null ? formatLocalizedNumber(stream.index + 1, 0) : null} />
			<DetailRow label="Type" value={kind} />
			<DetailRow label="Filename" value={filename} />
			<DetailRow label="Mimetype" value={mimetype} />
			<DetailRow label="Title" value={title} />
			<DetailRow label="Format" value={sanitizeCodecLabel(stream.codec_name ?? null)} />
			<DetailRow
				label="Resolution"
				value={stream.width && stream.height ? formatDimensions(stream.width, stream.height) : null}
			/>
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

	const detailedFormat = detailedProbe?.format;
	const detailedStreams = detailedProbe?.streams ?? [];
	const detailedAttachmentStreams = detailedStreams.filter(isAttachmentLikeStream);
	const detailedMediaStreams = detailedStreams.filter((s) => !isAttachmentLikeStream(s));
	const detailedVideo = detailedMediaStreams.find((s) => s.codec_type === 'video');
	const formatTagRows = Object.entries(detailedFormat?.tags ?? {}).filter(
		([k]) =>
			k.toLowerCase() !== 'major_brand' &&
			k.toLowerCase() !== 'compatible_brands' &&
			k.toLowerCase() !== 'encoder' &&
			k.toLowerCase() !== 'writing_application' &&
			k.toLowerCase() !== 'writing_library' &&
			!isTechnicalStatsTag(k),
	);
	const knownFormatKeys = new Set([
		'duration',
		'bit_rate',
		'format_name',
		'format_long_name',
		'size',
		'probe_score',
		'tags',
	]);
	const formatExtraRows = Object.entries(detailedFormat ?? {})
		.filter(([k]) => !knownFormatKeys.has(k))
		.map(([key, value]) => ({ key, value: valueToDisplay(value) }))
		.filter((row) => row.value != null);
	const overallFps = fractionToNumber(detailedVideo?.avg_frame_rate) ?? fractionToNumber(detailedVideo?.r_frame_rate);
	const detailsStillLoading = detailedProbePending && detailedStreams.length === 0;
	const metadataStatusLabel =
		streamInfoPending || detailsStillLoading
			? 'Loading metadata...'
			: metadataLoadStage === 'fonts'
				? 'Extracting subtitle fonts...'
				: metadataLoadStage === 'error' || detailedProbeError
					? 'Limited metadata available'
					: null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
			<div className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-3xl lg:max-w-4xl mx-4 rounded-2xl border border-border bg-surface p-5 sm:p-6 animate-scale-in shadow-2xl max-h-[85vh] overflow-y-auto">
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

				<div className="rounded-lg bg-bg/50 p-3 text-[13px] text-text-tertiary mb-4">
					For privacy, browser apps cannot access your full local path (like `D:\...`).
				</div>
				{metadataStatusLabel && (
					<div
						className={`rounded-lg p-2.5 mb-4 text-[13px] inline-flex items-center gap-1.5 ${
							metadataLoadStage === 'error'
								? 'bg-warning/10 text-warning border border-warning/30'
								: 'bg-accent/10 text-accent border border-accent/25'
						}`}
					>
						{metadataLoadStage === 'error' ? (
							<AlertCircle size={13} />
						) : (
							<LoaderCircle
								size={13}
								className={streamInfoPending || detailedProbePending ? 'animate-spin' : ''}
							/>
						)}
						{metadataStatusLabel}
					</div>
				)}

				{/* General */}
				<div className="flex flex-col gap-2 mb-4">
					<DetailRow label="File name" value={file.name} />
					<DetailRow label="File size" value={formatFileSize(file.size)} />
					<DetailRow label="Type" value={file.type || 'Unknown'} />
					<DetailRow
						label="Format"
						value={detailedFormat?.format_long_name ?? detailedFormat?.format_name ?? probeResult?.format}
					/>
					<DetailRow label="Title" value={getTagValue(detailedFormat?.tags, 'title')} />
					<DetailRow label="Format profile" value={getTagValue(detailedFormat?.tags, 'major_brand')} />
					<DetailRow label="Codec ID" value={getTagValue(detailedFormat?.tags, 'compatible_brands')} />
					<DetailRow
						label="Duration"
						value={
							formatSeconds(detailedFormat?.duration) ??
							(duration > 0 ? `${formatLocalizedNumber(duration, 2)} s` : null)
						}
					/>
					<DetailRow
						label="Overall bit rate"
						value={
							formatBitrateKbps(detailedFormat?.bit_rate) ??
							(probeResult && probeResult.bitrate > 0
								? `${formatLocalizedNumber(probeResult.bitrate, 0)} kb/s`
								: null)
						}
					/>
					<DetailRow
						label="Frame rate"
						value={overallFps != null ? `${formatLocalizedNumber(overallFps, 3)} FPS` : null}
					/>
					<DetailRow
						label="Writing application"
						value={
							getTagValue(detailedFormat?.tags, 'writing_application') ??
							getTagValue(detailedFormat?.tags, 'encoder')
						}
					/>
					<DetailRow label="Writing library" value={getTagValue(detailedFormat?.tags, 'writing_library')} />
					{formatTagRows.map(([key, value]) => (
						<DetailRow key={`format-tag-${key}`} label={labelFromKey(key)} value={value} />
					))}
					{formatExtraRows.map((row) => (
						<DetailRow key={`format-extra-${row.key}`} label={labelFromKey(row.key)} value={row.value} />
					))}
					<DetailRow label="Last modified" value={lastModified} />
				</div>

				{detailsStillLoading && (
					<p className="text-[13px] text-text-tertiary mb-3">Loading extended metadata...</p>
				)}
				{detailedProbeError && (
					<p className="text-[13px] text-warning bg-warning/10 rounded-md px-2.5 py-1.5 mb-3">
						{detailedProbeError}
					</p>
				)}

				{/* Streams */}
				<div className="flex flex-col gap-4">
					{detailedMediaStreams.length > 0 ? (
						<>
							<div>
								<div className="flex items-center gap-2 mb-2">
									<Film size={13} className="text-accent" />
									<span className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">
										Detailed Streams
									</span>
								</div>
								<div className="flex flex-col gap-2">
									{detailedMediaStreams.map((stream, idx) => (
										<DetailedStreamCard
											key={`${stream.codec_type ?? 'stream'}-${stream.index ?? idx}`}
											stream={stream}
										/>
									))}
								</div>
							</div>
						</>
					) : (
						<>
							<StreamSection icon={Film} label="Video Streams" streams={videoStreams} />
							<StreamSection icon={AudioLines} label="Audio Streams" streams={audioStreams} />
							<StreamSection icon={Subtitles} label="Subtitle Streams" streams={subtitleStreams} />
						</>
					)}
					{detailedAttachmentStreams.length > 0 && (
						<div>
							<div className="flex items-center gap-2 mb-2">
								<Paperclip size={13} className="text-accent" />
								<span className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">
									Attachments
								</span>
							</div>
							<div className="flex flex-col gap-2">
								{detailedAttachmentStreams.map((stream, idx) => (
									<AttachmentCard key={`attachment-${stream.index ?? idx}`} stream={stream} />
								))}
							</div>
						</div>
					)}
				</div>

				{!probeResult && !detailedProbePending && (
					<p className="text-[13px] text-text-tertiary mt-2">
						Stream details will appear once FFmpeg finishes probing.
					</p>
				)}
			</div>
		</div>
	);
}
