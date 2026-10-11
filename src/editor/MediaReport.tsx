import { ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { codecName, formatBitrate, formatBytes, formatFrameRate, formatLength } from '@/lib/format';
import { languageName } from '@/lib/language';
import type { MediaInfo } from '@/media/probe';
import {
	type AudioReport,
	type DolbyVision,
	type HdrFormat,
	type MasteringDisplay,
	type MediaReport,
	mediaReport,
	type SubtitleReport,
	type TrackBase,
	type VideoReport,
} from '@/media/report/report';
import type { AttachmentInfo } from '@/media/subtitle-source';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Row, TextRow } from './facts';

/** The full report of a file, once read; null meanwhile and for files it can't describe. */
export function useMediaReport(file: File | null): MediaReport | null {
	const [report, setReport] = useState<{ file: File; report: MediaReport | null } | null>(null);
	useEffect(() => {
		if (!file) return;
		let live = true;
		void mediaReport(file).then((read) => {
			if (live) setReport({ file, report: read });
		});
		return () => {
			live = false;
		};
	}, [file]);
	return report?.file === file ? report.report : null;
}

const number = (value: number, digits = 1) =>
	new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits }).format(value);

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/** `16:9`, or the ratio to one when the sides share no small divisor. */
export function aspectName(width: number, height: number): string {
	const divisor = gcd(width, height);
	const w = width / divisor;
	const h = height / divisor;
	if (w <= 32 && h <= 32) return `${w}:${h}`;
	// Two decimals, as films are told: 2.40:1, 1.85:1.
	const ratio = new Intl.NumberFormat(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	return `${ratio.format(width / height)}:1`;
}

function channelName(channels: number): string {
	if (channels === 1) return m.channels_mono();
	if (channels === 2) return m.channels_stereo();
	if (channels === 3) return '2.1';
	if (channels === 6) return '5.1';
	if (channels === 8) return '7.1';
	return m.channels_count({ count: channels });
}

const PRIMARIES: Record<string, string> = {
	bt709: 'BT.709',
	bt470bg: 'BT.601 PAL',
	smpte170m: 'BT.601 NTSC',
	bt2020: 'BT.2020',
	smpte432: 'Display P3',
};

const TRANSFERS: Record<string, string> = {
	'bt709': 'BT.709',
	'smpte170m': 'BT.601',
	'iec61966-2-1': 'sRGB',
	'linear': 'Linear',
	'pq': 'PQ',
	'hlg': 'HLG',
};

const MATRICES: Record<string, string> = {
	'rgb': 'RGB',
	'bt709': 'BT.709',
	'bt470bg': 'BT.601',
	'smpte170m': 'BT.601',
	'bt2020-ncl': 'BT.2020 NCL',
};

/** The gamut a mastering display was set to, known by the x of its red. */
function gamutName(primaries: MasteringDisplay['primaries']): string | null {
	const red = primaries?.red[0];
	if (red === undefined) return null;
	if (Math.abs(red - 0.708) < 0.005) return 'BT.2020';
	if (Math.abs(red - 0.68) < 0.005) return 'Display P3';
	if (Math.abs(red - 0.64) < 0.005) return 'BT.709';
	return null;
}

/** `Dolby Vision 8.1`: profile 8 is named with what plays without Dolby Vision. */
function dolbyVisionName(dolby: DolbyVision | null): string {
	if (!dolby) return 'Dolby Vision';
	return dolby.profile === 8 ? `Dolby Vision 8.${dolby.compatibility}` : `Dolby Vision ${dolby.profile}`;
}

const HDR_NAMES: Record<Exclude<HdrFormat, 'dolby-vision'>, string> = {
	'hdr10-plus': 'HDR10+',
	'hdr10': 'HDR10',
	'pq': 'PQ',
	'hlg': 'HLG',
};

/** SDR, or the kinds of HDR the video carries, richest first: what decides how it looks on each screen. */
function DynamicRange({ video }: { video: VideoReport }) {
	const names = video.hdr.map((format) =>
		format === 'dolby-vision' ? dolbyVisionName(video.dolbyVision) : HDR_NAMES[format],
	);
	return <Row label={m.info_dynamic_range()} value={names.length > 0 ? names.join(', ') : 'SDR'} />;
}

function fallbackName(compatibility: number): string {
	if (compatibility === 1 || compatibility === 6) return 'HDR10';
	if (compatibility === 2) return 'SDR';
	if (compatibility === 4) return 'HLG';
	return m.info_dv_fallback_none();
}

/** `48 kHz`, `44,1 kHz`: how sound rates are told. */
function formatKilohertz(hz: number): string {
	return `${number(hz / 1000)} kHz`;
}

const yesNo = (value: boolean) => (value ? m.yes() : m.no());

/** `Français`, with what the track is made for: `Français (sourds et malentendants)`. */
function languageLine(track: TrackBase): string | null {
	const known = track.language && track.language !== 'und' ? languageName(track.language) : null;
	const notes = [track.hearingImpaired && m.info_sdh_note(), track.described && m.info_described_note()].filter(
		(note) => note !== false,
	);
	if (!known) return notes.length > 0 ? notes.join(', ') : null;
	return notes.length > 0 ? `${known} (${notes.join(', ')})` : known;
}

/** Facts few look for, folded under a quiet line at the end of their section. */
function More({ children }: { children: ReactNode }) {
	return (
		<details className="group mt-1">
			<summary className="text-small text-muted hover:text-ink flex w-fit cursor-pointer list-none items-center gap-1 outline-none focus-visible:underline [&::-webkit-details-marker]:hidden">
				<ChevronRight
					className="size-4 transition-transform duration-150 group-open:rotate-90"
					strokeWidth={2}
					aria-hidden="true"
				/>
				{m.info_details()}
			</summary>
			<dl className="mt-3 grid gap-2.5">{children}</dl>
		</details>
	);
}

/** A section of the report: its heading, its main facts with room between them, the rest folded. */
function Section({
	title,
	aside,
	more,
	children,
}: {
	title: string;
	aside?: ReactNode;
	more?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="border-line grid gap-3.5 border-t pt-5">
			<div className="flex min-h-6 items-center justify-between gap-3">
				<h3 className="text-ui font-semibold">{title}</h3>
				{aside}
			</div>
			<dl className="grid gap-2.5">{children}</dl>
			{more}
		</section>
	);
}

/** The file itself: its extension and weight, the name being in the bar; what made it, folded. */
export function FileFacts({
	name,
	format,
	size,
	duration,
	report,
	children,
}: {
	name: string;
	/** The container, told in the details when the extension doesn't say it. */
	format: string | null;
	size: number;
	duration: number | null;
	report: MediaReport | null;
	children?: ReactNode;
}) {
	const extension = /\.([^.]+)$/.exec(name)?.[1]?.toUpperCase();
	const app = report?.writingApp;
	const muxer = report?.muxingApp && report.muxingApp !== app ? report.muxingApp : null;
	const created =
		report?.created && report.created.getFullYear() > 1970
			? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(report.created)
			: null;
	const more = [
		format && <Row key="format" label={m.info_container()} value={format} />,
		duration ? (
			<Row key="rate" label={m.info_overall_bitrate()} value={formatBitrate((size * 8) / duration)} />
		) : null,
		app && <TextRow key="app" label={m.info_writing_app()} value={app} />,
		muxer && <TextRow key="muxer" label={m.info_muxing_app()} value={muxer} />,
		created && <Row key="created" label={m.info_created()} value={created} />,
		report && report.attachments.length > 0 && <Attachments key="attached" attachments={report.attachments} />,
	].filter(Boolean);
	return (
		<Section
			title={m.info_file()}
			more={
				more.length > 0 || children ? (
					<More>
						{more}
						{children}
					</More>
				) : null
			}
		>
			{extension && <Row label={m.info_extension()} value={extension} />}
			<Row label={m.info_size()} value={formatBytes(size)} />
		</Section>
	);
}

function Attachments({ attachments }: { attachments: AttachmentInfo[] }) {
	return <TextRow label={m.info_attachments()} value={attachments.map((attachment) => attachment.name).join(', ')} />;
}

/** `23,976 fps (constant)`, or the range of a variable rate. */
function frameRate(info: MediaInfo['video']): string | null {
	if (info?.variable)
		return m.info_frame_rate_variable({ low: Math.round(info.variable.min), high: Math.round(info.variable.max) });
	return info?.fps != null ? `${formatFrameRate(info.fps)} (${m.info_constant()})` : null;
}

/** A video track: what one checks of a film, then the rest of its coding folded. */
export function VideoFacts({
	video,
	info,
	duration,
	title,
	aside,
}: {
	/** The report's track; null while it is read, or when the file can't be described further. */
	video: VideoReport | null;
	/** The main track as probed, with its measured frame rate. */
	info: MediaInfo['video'];
	duration: number | null;
	title: string;
	aside?: ReactNode;
}) {
	const rotated = video?.rotation === 90 || video?.rotation === 270;
	const size = video
		? rotated
			? { width: video.displayHeight, height: video.displayWidth }
			: { width: video.displayWidth, height: video.displayHeight }
		: info && { width: info.width, height: info.height };
	const codec = video?.codec ?? info?.codec ?? null;
	const depth = video?.bitDepth != null ? m.info_bits_short({ bits: video.bitDepth }) : null;
	const rate = frameRate(info);
	const length = video?.duration ?? duration;
	return (
		<Section title={title} aside={aside} more={video && <VideoMore video={video} />}>
			{codec && <Row label={m.info_codec()} value={[codecName(codec), depth].filter(Boolean).join(', ')} />}
			{video && <DynamicRange video={video} />}
			{length !== null && <Row label={m.info_duration()} value={formatLength(length)} />}
			{video?.bitrate != null && (
				<Row
					label={m.info_bitrate()}
					value={`${video.bitrateEstimated ? '≈ ' : ''}${formatBitrate(video.bitrate)}`}
				/>
			)}
			{size && (
				<Row
					label={m.info_resolution()}
					value={`${size.width} × ${size.height} (${aspectName(size.width, size.height)})`}
				/>
			)}
			{rate && <Row label={m.info_frame_rate()} value={rate} />}
		</Section>
	);
}

function VideoMore({ video }: { video: VideoReport }) {
	const dolby = video.dolbyVision;
	const mastering = video.mastering;
	const gamut = mastering && gamutName(mastering.primaries);
	const primaries = video.primaries && (PRIMARIES[video.primaries] ?? video.primaries);
	const matrix = video.matrix && (MATRICES[video.matrix] ?? video.matrix);
	// The matrix goes without saying when it follows the primaries, as it nearly always does.
	const colours = [
		primaries,
		video.transfer && (TRANSFERS[video.transfer] ?? video.transfer),
		matrix && !matrix.startsWith(primaries || '–') && matrix,
	].filter(Boolean);
	return (
		<More>
			{video.profile && <Row label={m.info_codec_profile()} value={video.profile} />}
			{video.level && (
				<Row
					label={m.info_level()}
					value={video.tier ? m.info_level_tier({ level: video.level, tier: video.tier }) : video.level}
				/>
			)}
			{video.chroma && <Row label={m.info_chroma()} value={video.chroma} />}
			{video.fullRange !== null && (
				<Row label={m.info_range()} value={video.fullRange ? m.info_range_full() : m.info_range_limited()} />
			)}
			{colours.length > 0 && <Row label={m.info_colours()} value={colours.join(', ')} />}
			{dolby && (
				<>
					<Row
						label="Dolby Vision"
						value={m.info_dv_profile({ profile: String(dolby.profile), level: String(dolby.level) })}
					/>
					<Row
						label={m.info_dv_layers()}
						value={[dolby.baseLayer && 'BL', dolby.enhancementLayer && 'EL', dolby.rpu && 'RPU']
							.filter(Boolean)
							.join(' + ')}
					/>
					<Row label={m.info_dv_fallback()} value={fallbackName(dolby.compatibility)} />
				</>
			)}
			{mastering && (
				<Row
					label={m.info_mastering()}
					value={[`${number(mastering.maxLuminance, 0)} cd/m²`, gamut].filter(Boolean).join(', ')}
				/>
			)}
			{video.light && (
				<Row
					label={m.info_content_light()}
					value={`${number(video.light.maxCll, 0)} / ${number(video.light.maxFall, 0)} cd/m²`}
				/>
			)}
			{video.pixelAspect && (
				<Row
					label={m.info_stored_size()}
					value={`${video.width} × ${video.height}, ${video.pixelAspect[0]}:${video.pixelAspect[1]}`}
				/>
			)}
			{video.rotation !== 0 && <Row label={m.info_rotation()} value={`${video.rotation}°`} />}
			{video.codecString && <Row label={m.info_codec_id()} value={video.codecString} />}
			<Row label={m.info_track_number()} value={String(video.id)} />
		</More>
	);
}

/** `TrueHD Atmos`, `DTS-HD MA`, `AAC LC`. */
function audioCodecName(audio: Pick<AudioReport, 'codec' | 'profile'>): string {
	const name = audio.codec ? codecName(audio.codec) : '–';
	if (!audio.profile) return name;
	if (audio.codec === 'dts') return `DTS-HD ${audio.profile}`;
	if (audio.profile.startsWith('HE-AAC')) return audio.profile;
	return `${name} ${audio.profile}`;
}

/** A sound track, or what the probe read of the first while the report is read. */
export function AudioFacts({
	audio,
	probed,
	duration,
	title,
	aside,
}: {
	audio: AudioReport | null;
	probed: MediaInfo['audio'];
	/** The file's, for a track whose own length is unknown. */
	duration: number | null;
	title: string;
	aside?: ReactNode;
}) {
	const codec = audio ? audioCodecName(audio) : probed?.codec ? codecName(probed.codec) : null;
	const channels = audio?.channels ?? probed?.channels;
	const sampleRate = audio?.sampleRate ?? probed?.sampleRate;
	const language = audio && languageLine(audio);
	const length = audio?.duration ?? duration;
	const mode = audio?.bitrateMode && (audio.bitrateMode === 'constant' ? m.info_constant() : m.info_variable());
	return (
		<Section
			title={title}
			aside={aside}
			more={
				audio && (
					<More>
						{audio.bitDepth !== null && (
							<Row label={m.info_bit_depth()} value={m.info_bits_short({ bits: audio.bitDepth })} />
						)}
						<Row label={m.info_flag_default()} value={yesNo(audio.default)} />
						{audio.commentary && <Row label={m.info_flag_commentary()} value={m.yes()} />}
						<Row label={m.info_track_number()} value={String(audio.id)} />
					</More>
				)
			}
		>
			{audio?.name && <TextRow label={m.info_name()} value={audio.name} />}
			{language && <TextRow label={m.info_language()} value={language} />}
			{codec && <Row label={m.info_codec()} value={codec} />}
			{length !== null && <Row label={m.info_duration()} value={formatLength(length)} />}
			{audio?.bitrate != null && (
				<Row
					label={m.info_bitrate()}
					value={mode ? `${formatBitrate(audio.bitrate)} (${mode})` : formatBitrate(audio.bitrate)}
				/>
			)}
			{channels !== undefined && <Row label={m.info_channels()} value={channelName(channels)} />}
			{sampleRate !== undefined && <Row label={m.info_sample_rate()} value={formatKilohertz(sampleRate)} />}
		</Section>
	);
}

const SUBTITLE_FORMATS: Record<string, string> = {
	'S_TEXT/UTF8': 'SRT',
	'S_TEXT/ASCII': 'SRT',
	'S_TEXT/ASS': 'ASS',
	'S_TEXT/SSA': 'SSA',
	'S_ASS': 'ASS',
	'S_SSA': 'SSA',
	'S_TEXT/WEBVTT': 'WebVTT',
	'S_HDMV/PGS': 'PGS',
	'S_VOBSUB': 'VobSub',
	'S_DVBSUB': 'DVB',
	'tx3g': 'Timed Text',
	'text': 'Timed Text',
	'wvtt': 'WebVTT',
	'stpp': 'TTML',
};

function SubtitleFacts({ track, title }: { track: SubtitleReport; title: string }) {
	const language = languageLine(track);
	return (
		<Section
			title={title}
			more={
				<More>
					<Row label={m.info_codec_id()} value={track.codec} />
					<Row label={m.info_track_number()} value={String(track.id)} />
				</More>
			}
		>
			{track.name && <TextRow label={m.info_name()} value={track.name} />}
			{language && <TextRow label={m.info_language()} value={language} />}
			{track.duration !== null && <Row label={m.info_duration()} value={formatLength(track.duration)} />}
			<Row label={m.info_type()} value={SUBTITLE_FORMATS[track.codec] ?? track.codec.replace(/^S_/, '')} />
			<Row label={m.info_flag_default()} value={yesNo(track.default)} />
			<Row label={m.info_flag_forced()} value={yesNo(track.forced)} />
		</Section>
	);
}

/** The subtitle tracks, then the chapters, numbered as players list them. */
export function ReportExtras({ report }: { report: MediaReport }) {
	const several = report.subtitles.length > 1;
	return (
		<>
			{report.subtitles.map((track, index) => (
				<SubtitleFacts
					key={track.id}
					track={track}
					title={several ? m.info_subtitle_track({ number: index + 1 }) : m.info_subtitles_section()}
				/>
			))}
			{report.chapters.length > 0 && (
				<section className="border-line grid gap-3.5 border-t pt-5">
					<h3 className="text-ui font-semibold">{m.info_chapters()}</h3>
					<ol className="grid gap-2.5">
						{report.chapters.map((chapter, index) => (
							// Two chapters may share a start and a name.
							// oxlint-disable-next-line react/no-array-index-key
							<li key={index} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-2">
								<span className="text-small text-muted tabular text-right">{index + 1}</span>
								<span className="text-ui text-ink break-words">{chapter.name || '–'}</span>
							</li>
						))}
					</ol>
				</section>
			)}
		</>
	);
}
