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
	formatShutter,
	formatTimecode,
} from '@/lib/format';
import type { PhotoMetadata } from '@/media/probe';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { PanelTitle } from './EditorLayout';

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
			<dt className="text-ink-2">{label}</dt>
			<dd className="tabular font-mono text-[12.5px]">{value}</dd>
		</div>
	);
}

/** Free text such as a title: proportional font, allowed to wrap. */
function TextRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-3">
			<dt className="text-ink-2">{label}</dt>
			<dd className="text-right font-medium break-words">{value}</dd>
		</div>
	);
}

function SupportRow({ label, supported }: { label: string; supported: boolean }) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
			<dt className="text-ink-2">{label}</dt>
			<dd className={supported ? 'text-ed-text font-medium' : 'text-danger font-medium'}>
				{supported ? m.supported() : m.not_supported()}
			</dd>
		</div>
	);
}

function CameraSection({ photo }: { photo: PhotoMetadata }) {
	// Free text reads best in the interface font; measured values use the mono face.
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
		<section className="grid gap-3.5">
			<h3 className="text-ui text-ink-2 font-semibold">{m.info_camera_section()}</h3>
			<dl className="grid gap-3.5">
				{shownText.map(([label, value]) => (
					<TextRow key={label} label={label} value={value} />
				))}
				{shownValues.map(([label, value]) => (
					<Row key={label} label={label} value={value} />
				))}
			</dl>
			{photo.location && <p className="text-small text-ed-text font-medium">{m.location_warning()}</p>}
		</section>
	);
}

export function InfoPanel({ opened }: { opened: OpenedFile | null }) {
	if (!opened) return null;
	const info = opened.info;
	if (!info) {
		return (
			<dl className="grid gap-3.5">
				<Row label={m.info_format()} value={opened.format.toUpperCase()} />
				<Row label={m.info_size()} value={formatBytes(opened.file.size)} />
			</dl>
		);
	}
	const video = info.video;
	const audio = info.audio;
	const fps = video?.fps ?? 30;

	return (
		<div className="grid gap-7">
			{info.tags && (
				<dl className="grid gap-3.5">
					{info.tags.title && <TextRow label={m.info_title()} value={info.tags.title} />}
					{info.tags.artist && <TextRow label={m.info_artist()} value={info.tags.artist} />}
					{info.tags.album && <TextRow label={m.info_album()} value={info.tags.album} />}
				</dl>
			)}
			<dl className="grid gap-3.5">
				<Row label={m.info_format()} value={info.format} />
				<Row label={m.info_size()} value={formatBytes(info.size)} />
				{info.duration !== null && <Row label={m.info_duration()} value={formatTimecode(info.duration, fps)} />}
				{info.dimensions && (
					<Row label={m.info_resolution()} value={`${info.dimensions.width} × ${info.dimensions.height}`} />
				)}
				{info.cues && <Row label={m.info_cues()} value={String(info.cues.length)} />}
			</dl>

			{info.photo && <CameraSection photo={info.photo} />}

			{video && (
				<dl className="grid gap-3.5">
					<Row label={m.info_video_codec()} value={video.codec ? codecName(video.codec) : '–'} />
					<Row label={m.info_resolution()} value={`${video.width} × ${video.height}`} />
					{video.fps !== null && <Row label={m.info_frame_rate()} value={formatFrameRate(video.fps)} />}
					<SupportRow label={m.info_playback()} supported={video.decodable} />
				</dl>
			)}

			{audio && (
				<dl className="grid gap-3.5">
					<Row label={m.info_audio_codec()} value={audio.codec ? codecName(audio.codec) : '–'} />
					<Row label={m.info_sample_rate()} value={formatSampleRate(audio.sampleRate)} />
					<Row label={m.info_channels()} value={String(audio.channels)} />
					<SupportRow label={m.info_playback()} supported={audio.decodable} />
				</dl>
			)}
		</div>
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
