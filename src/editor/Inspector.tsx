import { EDITORS, type MediaKind, TOOL_LABELS, type ToolId } from '@/editors/registry';
import { codecName, formatBytes, formatFrameRate, formatSampleRate, formatTimecode } from '@/lib/format';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';

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

function InfoPanel({ opened }: { opened: OpenedFile | null }) {
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

export function Inspector({ kind, tool, opened }: { kind: MediaKind; tool: ToolId; opened: OpenedFile | null }) {
	return (
		<aside aria-label={m.inspector()} className="grid h-full content-start gap-6 overflow-auto px-5 py-6">
			<h2 className="text-title font-bold tracking-[-0.03em]">
				{tool === 'info' ? m.info_file() : TOOL_LABELS[tool]()}
			</h2>
			{tool === 'info' ? (
				<InfoPanel opened={opened} />
			) : (
				<p className="text-ui text-muted -mt-3">{m.tool_later({ editor: EDITORS[kind].label() })}</p>
			)}
		</aside>
	);
}
