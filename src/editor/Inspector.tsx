import { X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import {
	codecName,
	formatAperture,
	formatBytes,
	formatCoordinates,
	formatExifDate,
	formatFocalLength,
	formatFrameRate,
	formatSampleRate,
	formatPreciseTime,
	formatShutter,
} from '@/lib/format';
import { type ImageDetails, readImageDetails } from '@/lib/image-details';
import type { PhotoMetadata } from '@/media/probe';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { PanelTitle } from './EditorLayout';

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
			<dt className="text-muted">{label}</dt>
			<dd className="tabular font-medium">{value}</dd>
		</div>
	);
}

/** A few facts under a heading of their own, set off from the others by a line. */
function Facts({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
	return (
		<section className="border-line grid gap-2.5 border-t pt-4">
			{title && (
				<div className="flex items-center justify-between gap-3">
					<h3 className="text-ui font-semibold">{title}</h3>
					{aside}
				</div>
			)}
			<dl className="text-ui grid gap-2">{children}</dl>
		</section>
	);
}

/** When the file was last changed, small, under the figures: its name is already in the bar. */
function Modified({ file }: { file: File }) {
	if (file.lastModified <= 0) return null;
	const date = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
		file.lastModified,
	);
	return <p className="text-small text-muted -mt-1">{m.info_modified_on({ date })}</p>;
}

/** The few figures one looks for first, large, side by side. */
function Summary({ items }: { items: [string, string][] }) {
	return (
		<dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
			{items.map(([label, value]) => (
				<div key={label} className="grid content-start gap-0.5">
					<dd className="text-lead tabular leading-tight font-semibold tracking-[-0.01em] whitespace-nowrap">
						{value}
					</dd>
					<dt className="text-caption text-muted order-first">{label}</dt>
				</div>
			))}
		</dl>
	);
}

/** Beside a stream's heading when this browser can't play it; playing is what is expected. */
function Playback({ supported }: { supported: boolean }) {
	if (supported) return null;
	return (
		<span className="text-caption bg-danger/10 text-danger inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
			<X className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
			{m.info_plays_not()}
		</span>
	);
}

/** Free text such as a title: proportional font, allowed to wrap. */
function TextRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-3">
			<dt className="text-muted">{label}</dt>
			<dd className="text-right font-medium break-words">{value}</dd>
		</div>
	);
}

/** Bits per second, as players show it. */
function formatBitrate(bits: number): string {
	const locale = getLocale();
	return bits >= 1_000_000
		? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bits / 1_000_000)} Mb/s`
		: `${Math.round(bits / 1000)} kb/s`;
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/** `16:9`, or the ratio to one when the sides share no small divisor. */
function aspectName(width: number, height: number): string {
	const divisor = gcd(width, height);
	const w = width / divisor;
	const h = height / divisor;
	if (w <= 32 && h <= 32) return `${w}:${h}`;
	return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(width / height)}:1`;
}

function channelName(channels: number): string {
	if (channels === 1) return m.channels_mono();
	if (channels === 2) return m.channels_stereo();
	if (channels === 6) return '5.1';
	if (channels === 8) return '7.1';
	return String(channels);
}

/** The picture's own facts: shape, pixels, depth, transparency, colours, quality. */
function ImageFacts({ file, size }: { file: File; size: { width: number; height: number } }) {
	const [details, setDetails] = useState<ImageDetails | null>(null);
	useEffect(() => {
		let live = true;
		// The headers sit at the start; a large photo is not read whole for them.
		void file
			.slice(0, 1 << 20)
			.arrayBuffer()
			.then((buffer) => {
				if (live) setDetails(readImageDetails(new Uint8Array(buffer)));
			});
		return () => {
			live = false;
		};
	}, [file]);
	const megapixels = (size.width * size.height) / 1_000_000;
	const yesNo = (value: boolean) => (value ? m.supported() : m.not_supported());
	return (
		<Facts title={m.info_picture_section()}>
			<Row label={m.info_aspect()} value={aspectName(size.width, size.height)} />
			<Row
				label={m.info_megapixels()}
				value={`${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(megapixels)} MP`}
			/>
			{details?.bitDepth != null && (
				<Row label={m.info_bit_depth()} value={m.info_bits({ bits: details.bitDepth })} />
			)}
			{details?.alpha != null && <Row label={m.info_transparency()} value={yesNo(details.alpha)} />}
			{details?.profile && <TextRow label={m.info_profile()} value={details.profile} />}
			{details?.quality != null && <Row label={m.info_jpeg_quality()} value={`≈ ${details.quality}`} />}
			{details?.chroma && <Row label={m.info_chroma()} value={details.chroma} />}
			{details?.progressive != null && <Row label={m.info_progressive()} value={yesNo(details.progressive)} />}
			{details?.lossless != null && (
				<Row label={m.info_compression()} value={details.lossless ? m.info_lossless() : m.info_lossy()} />
			)}
		</Facts>
	);
}

function CameraSection({ photo }: { photo: PhotoMetadata }) {
	// Free text first, then measured values.
	const text: [string, string | null][] = [
		[m.info_camera(), photo.camera],
		[m.info_lens(), photo.lens],
		[m.info_taken(), photo.taken === null ? null : formatExifDate(photo.taken, getLocale())],
		[m.info_software(), photo.software],
	];
	const values: [string, string | null][] = [
		[m.info_shutter(), photo.exposureTime === null ? null : formatShutter(photo.exposureTime)],
		[m.info_aperture(), photo.fNumber === null ? null : formatAperture(photo.fNumber)],
		[m.info_iso(), photo.iso === null ? null : String(photo.iso)],
		[m.info_focal(), photo.focalLength === null ? null : formatFocalLength(photo.focalLength)],
		[m.info_location(), photo.location && formatCoordinates(photo.location.latitude, photo.location.longitude)],
	];
	const present = (row: [string, string | null]): row is [string, string] => Boolean(row[1]);
	const shownText = text.filter(present);
	const shownValues = values.filter(present);
	if (shownText.length === 0 && shownValues.length === 0) return null;
	return (
		<div className="grid gap-2.5">
			<Facts title={m.info_camera_section()}>
				{shownText.map(([label, value]) => (
					<TextRow key={label} label={label} value={value} />
				))}
				{shownValues.map(([label, value]) => (
					<Row key={label} label={label} value={value} />
				))}
			</Facts>
			{photo.location && <p className="text-small text-ed-text font-medium">{m.location_warning()}</p>}
		</div>
	);
}

/** Whether a format is the one an extension names: `MKV` for `.mkv`, `JPEG` for `.jpg`. */
function sameFormat(format: string, extension: string | undefined): boolean {
	if (!extension) return false;
	const aliases: Record<string, string> = {
		jpg: 'jpeg',
		tif: 'tiff',
		htm: 'html',
		m4a: 'mp4',
		m4v: 'mp4',
		mka: 'mkv',
	};
	const name = format.toLowerCase();
	return name === extension || name === aliases[extension];
}

function InfoPanel({ opened }: { opened: OpenedFile | null }) {
	if (!opened) return null;
	// An animation made from images: all of them, not only the first.
	if (opened.images) {
		const dimensions = opened.info?.dimensions;
		return (
			<Facts>
				<Row label={m.info_images()} value={String(opened.images.length)} />
				<Row
					label={m.info_size()}
					value={formatBytes(opened.images.reduce((sum, image) => sum + image.file.size, 0))}
				/>
				{dimensions && <Row label={m.info_resolution()} value={`${dimensions.width} × ${dimensions.height}`} />}
			</Facts>
		);
	}
	const info = opened.info;
	if (!info) {
		return (
			<Facts>
				<Row label={m.info_format()} value={opened.format.toUpperCase()} />
				<Row label={m.info_size()} value={formatBytes(opened.file.size)} />
			</Facts>
		);
	}
	const video = info.video;
	const audio = info.audio;
	const dimensions = info.dimensions ?? (video ? { width: video.width, height: video.height } : null);
	const summary: [string, string][] = [];
	if (info.duration !== null) summary.push([m.info_duration(), formatPreciseTime(info.duration)]);
	if (dimensions) summary.push([m.info_resolution(), `${dimensions.width} × ${dimensions.height}`]);
	if (info.cues) summary.push([m.info_cues(), String(info.cues.length)]);
	// The format is the name's extension, shown in the bar, unless the file is named otherwise.
	const extension = /\.([^.]+)$/.exec(opened.file.name)?.[1]?.toLowerCase();
	if (!sameFormat(info.format, extension)) summary.push([m.info_format(), info.format]);
	summary.push([m.info_size(), formatBytes(info.size)]);

	return (
		<>
			<Summary items={summary} />
			<Modified file={opened.file} />

			{info.tags && (info.tags.title || info.tags.artist || info.tags.album) && (
				<Facts title={m.info_tags_section()}>
					{info.tags.title && <TextRow label={m.info_title()} value={info.tags.title} />}
					{info.tags.artist && <TextRow label={m.info_artist()} value={info.tags.artist} />}
					{info.tags.album && <TextRow label={m.info_album()} value={info.tags.album} />}
				</Facts>
			)}

			{info.kind === 'image' && dimensions && <ImageFacts file={opened.file} size={dimensions} />}

			{info.photo && <CameraSection photo={info.photo} />}

			{video && (
				<Facts title={m.info_video_section()} aside={<Playback supported={video.decodable} />}>
					<Row label={m.info_codec()} value={video.codec ? codecName(video.codec) : '–'} />
					<Row label={m.info_resolution()} value={`${video.width} × ${video.height}`} />
					<Row label={m.info_aspect()} value={aspectName(video.width, video.height)} />
					{video.fps !== null && (
						<Row
							label={m.info_frame_rate()}
							value={
								video.variable
									? m.info_frame_rate_variable({
											low: Math.round(video.variable.min),
											high: Math.round(video.variable.max),
										})
									: formatFrameRate(video.fps)
							}
						/>
					)}
					{info.duration !== null && info.duration > 0 && (
						<Row label={m.info_bitrate()} value={formatBitrate((info.size * 8) / info.duration)} />
					)}
				</Facts>
			)}

			{audio && (
				<Facts title={m.info_audio_section()} aside={<Playback supported={audio.decodable} />}>
					<Row label={m.info_codec()} value={audio.codec ? codecName(audio.codec) : '–'} />
					<Row label={m.info_sample_rate()} value={formatSampleRate(audio.sampleRate)} />
					<Row label={m.info_channels()} value={channelName(audio.channels)} />
				</Facts>
			)}
		</>
	);
}

/** Placeholder for tools that are planned but not built yet. */
export function ToolLater({ kind, tool }: { kind: MediaKind; tool: ToolId }) {
	return (
		<>
			<PanelTitle>{TOOL_LABELS[tool]()}</PanelTitle>
			<p className="text-ui text-muted -mt-3">{m.tool_later({ editor: EDITORS[kind].label() })}</p>
		</>
	);
}

export function FilePanel({ opened }: { opened: OpenedFile | null }) {
	return (
		<>
			<PanelTitle>{m.info_file()}</PanelTitle>
			<InfoPanel opened={opened} />
		</>
	);
}
