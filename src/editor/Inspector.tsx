import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import {
	formatAperture,
	formatBytes,
	formatCoordinates,
	formatExifDate,
	formatFocalLength,
	formatShutter,
} from '@/lib/format';
import { type ImageDetails, readImageDetails } from '@/lib/image-details';
import type { PhotoMetadata } from '@/media/probe';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { PanelTitle } from './EditorLayout';
import { Facts, Row, TextRow } from './facts';
import { AudioFacts, aspectName, FileFacts, ReportExtras, useMediaReport, VideoFacts } from './MediaReport';

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
			<Row label={m.info_resolution()} value={`${size.width} × ${size.height}`} />
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
	const info = opened?.info ?? null;
	// Videos and sound files get the full report; stills and animations keep their own facts.
	const timed =
		info !== null &&
		info.kind !== 'image' &&
		info.duration !== null &&
		(info.video !== null || info.audio !== null);
	const report = useMediaReport(timed && !opened?.images ? (opened?.file ?? null) : null);
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
	if (!info)
		return (
			<FileFacts name={opened.file.name} format={null} size={opened.file.size} duration={null} report={null} />
		);
	const video = info.video;
	const audio = info.audio;
	// The format is the name's extension, shown in the bar, unless the file is named otherwise.
	const extension = /\.([^.]+)$/.exec(opened.file.name)?.[1]?.toLowerCase();
	const format = sameFormat(info.format, extension) ? null : info.format;

	const several = (count: number, number: number, alone: string, numbered: (number: number) => string) =>
		count > 1 ? numbered(number) : alone;
	const videoTracks = report?.video ?? [];
	const audioTracks = report?.audio ?? [];
	const duration = timed ? info.duration : null;

	return (
		<>
			<FileFacts name={opened.file.name} format={format} size={info.size} duration={duration} report={report}>
				{info.cues && <Row label={m.info_cues()} value={String(info.cues.length)} />}
			</FileFacts>

			{info.tags && (info.tags.title || info.tags.artist || info.tags.album) && (
				<Facts title={m.info_tags_section()}>
					{info.tags.title && <TextRow label={m.info_title()} value={info.tags.title} />}
					{info.tags.artist && <TextRow label={m.info_artist()} value={info.tags.artist} />}
					{info.tags.album && <TextRow label={m.info_album()} value={info.tags.album} />}
				</Facts>
			)}

			{info.kind === 'image' && info.dimensions && <ImageFacts file={opened.file} size={info.dimensions} />}
			{/* An animation the report can't read: its size at least. */}
			{info.kind !== 'image' && !video && info.dimensions && (
				<Facts title={m.info_picture_section()}>
					<Row
						label={m.info_resolution()}
						value={`${info.dimensions.width} × ${info.dimensions.height} (${aspectName(info.dimensions.width, info.dimensions.height)})`}
					/>
				</Facts>
			)}
			{info.photo && <CameraSection photo={info.photo} />}

			{video &&
				info.kind !== 'image' &&
				(videoTracks.length > 0 ? videoTracks : [null]).map((track, index) => (
					<VideoFacts
						key={track?.id ?? 'probed'}
						video={track}
						info={index === 0 ? video : null}
						duration={duration}
						title={several(videoTracks.length, index + 1, m.info_video_section(), (number) =>
							m.info_video_track({ number }),
						)}
						aside={index === 0 ? <Playback supported={video.decodable} /> : undefined}
					/>
				))}
			{audio &&
				(audioTracks.length > 0 ? audioTracks : report ? [] : [null]).map((track, index) => (
					<AudioFacts
						key={track?.id ?? 'probed'}
						audio={track}
						probed={index === 0 ? audio : null}
						duration={duration}
						title={several(audioTracks.length, index + 1, m.info_audio_section(), (number) =>
							m.info_audio_track({ number }),
						)}
						aside={index === 0 ? <Playback supported={audio.decodable} /> : undefined}
					/>
				))}
			{report && <ReportExtras report={report} />}
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
			<PanelTitle>{m.info_panel()}</PanelTitle>
			<InfoPanel opened={opened} />
		</>
	);
}
