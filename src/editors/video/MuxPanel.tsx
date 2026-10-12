import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isShortened } from '@/document/kept';
import { ExportAnnounce } from '@/editor/ExportAnnounce';
import { outputName } from '@/media/save';
import { openSaveTarget } from '@/media/save-target';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { whenRead } from '../subtitles/project';
import { useSubtitleEditor } from '../subtitles/store';
import { pictureChange, type VideoDoc } from './document';
import { chooseEncoding, CONTAINERS, EncoderMissing, type VideoExportSettings, type VideoSource } from './export';
import { exportConverted, exportVideo, muxContainer, soundChanged, useMuxTracks } from './mux';
import { useVideoEditor } from './store';

/** A conversion to run instead of copying the tracks. */
export interface ConvertOrder {
	settings: VideoExportSettings;
	doc: VideoDoc;
	upright: { width: number; height: number };
	source: Pick<VideoSource, 'bitrate' | 'frameRate' | 'codec'>;
	/** Bit depth of the pictures: 10 where the encoder takes it. */
	bitDepth?: 8 | 10;
}

/**
 * Writes the video with the chosen tracks: copied as they are, or converted with the edits when
 * `convert` is given. `blocked` when neither can be done.
 */
export function MuxFooter({
	opened,
	blocked = false,
	convert = null,
}: {
	opened: OpenedFile;
	blocked?: boolean;
	convert?: ConvertOrder | null;
}) {
	const encoding = convert?.settings.mode === 'encode';
	const target = encoding ? convert.settings.container : null;
	const listed = useMuxTracks(opened.file, opened.format, target, encoding ? convert.settings.burn : null);
	// Copied as it is by the remuxer, unless the edits, the sound, the turn or the tags need the
	// file written again.
	const rewrite =
		convert !== null &&
		(convert.settings.mode === 'encode' ||
			isShortened(convert.doc) ||
			convert.doc.meta !== null ||
			pictureChange(convert.doc.picture) !== 'none' ||
			(listed ? soundChanged(listed.tracks) : false));
	const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
	const [failure, setFailure] = useState<string | null>(null);
	// The graphics card failed to encode: software is offered instead.
	const [gpuFailed, setGpuFailed] = useState(false);
	const [progress, setProgress] = useState(0);
	const abort = useRef<AbortController | null>(null);
	const container = target ?? muxContainer(opened.format);
	const kind = CONTAINERS[container];

	useEffect(() => {
		if (status !== 'saved') return;
		const timer = setTimeout(() => {
			setStatus('idle');
		}, 2400);
		return () => {
			clearTimeout(timer);
		};
	}, [status]);

	/** Writes the video; `settings` stand in for the chosen ones, as when retried in software. */
	const run = async (settings = convert?.settings) => {
		if (!listed) return;
		const save = await openSaveTarget(outputName(opened.file.name, kind.extension), {
			mime: kind.mime,
			extension: kind.extension,
			description: kind.label,
		});
		if (!save) return;
		const controller = new AbortController();
		abort.current = controller;
		setProgress(0);
		setStatus('saving');
		setGpuFailed(false);
		try {
			// Subtitle tracks still being read are written whole.
			await whenRead();
			const job = {
				file: opened.file,
				format: opened.format,
				tracks: listed.tracks,
				shown: () => useSubtitleEditor.getState().history.present,
				title: opened.file.name.replace(/\.[^.]+$/, ''),
			};
			if (convert && settings && rewrite) {
				await exportConverted(
					{ ...job, ...convert, settings, originals: listed.originals },
					save,
					setProgress,
					controller.signal,
				);
			} else {
				await exportVideo(job, listed.originals, save, setProgress, controller.signal);
			}
			await save.commit();
			setStatus('saved');
		} catch (error) {
			await save.discard().catch(() => undefined);
			const onGpu = settings?.mode === 'encode' && settings.encoder === 'gpu';
			setGpuFailed(onGpu && !(error instanceof EncoderMissing && error.kind === 'audio'));
			setFailure(
				error instanceof EncoderMissing
					? error.kind === 'video'
						? m.convert_no_video_encoder()
						: m.convert_no_audio_encoder()
					: null,
			);
			setStatus(error instanceof DOMException && error.name === 'AbortError' ? 'idle' : 'failed');
		} finally {
			abort.current = null;
		}
	};

	/** The same export, on the processor: the codec too when software can't write the chosen one. */
	const retryInSoftware = () => {
		const chosen = convert?.settings;
		const source = useVideoEditor.getState().exportSource;
		if (!chosen || !source) return;
		const encoding = chooseEncoding(source.encoders, CONTAINERS[chosen.container].codecs, chosen.codec, 'software');
		useVideoEditor.getState().setExport(encoding);
		void run({ ...chosen, ...encoding });
	};

	return (
		<>
			{status === 'saving' && (
				<div className="bg-surface-2 h-1 overflow-hidden rounded-full" aria-hidden="true">
					<div
						className="bg-ed h-full transition-[width] duration-200"
						style={{ width: `${progress * 100}%` }}
					/>
				</div>
			)}
			<div className="flex gap-2">
				<Button
					variant="primary"
					className="h-11 flex-1"
					disabled={!listed || blocked}
					busy={status === 'saving'}
					onClick={() => void run()}
				>
					{status === 'saving' ? (
						m.exporting_percent({ percent: Math.floor(progress * 100) })
					) : status === 'saved' ? (
						<>
							<Check size={17} strokeWidth={2.4} aria-hidden="true" />
							{m.saved()}
						</>
					) : (
						m.export_as({ format: kind.label })
					)}
				</Button>
				{status === 'saving' && (
					<Button className="h-11" onClick={() => abort.current?.abort()}>
						{m.stop()}
					</Button>
				)}
			</div>
			<ExportAnnounce status={status} />
			{status === 'failed' &&
				(gpuFailed ? (
					<div role="alert" className="grid gap-2">
						<p className="text-small text-danger">{m.encoder_gpu_failed()}</p>
						<Button onClick={retryInSoftware}>{m.encoder_software_retry()}</Button>
					</div>
				) : (
					<p role="alert" className="text-small text-danger">
						{failure ?? m.mux_failed()}
					</p>
				))}
		</>
	);
}
