/**
 * Converting several videos with the same settings, one after the other, as Subtitle Edit or
 * HandBrake do with a queue: each keeps all its sound and subtitle tracks, and its fonts.
 */
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { ItemStatus } from '@/editor/BatchList';
import { outputName, uniqueName } from '@/media/save';
import { downloadTarget, type FolderTargets } from '@/media/save-target';
import type { BatchFile } from '@/media/session';
import { SubtitleSource } from '@/media/subtitle-source';
import type { SubtitleDoc } from '../subtitles/document';
import { codecLabel, trackDoc, trackKind } from '../subtitles/tracks';
import { createVideoDoc } from './document';
import {
	CONTAINERS,
	encodableCodecs,
	presetSettings,
	readVideoSource,
	resolveAudio,
	shortSide,
	type VideoExportSettings,
} from './export';
import { audioCodecName, exportConverted, type MuxTrack } from './mux';

export interface VideoBatchJob {
	items: readonly BatchFile[];
	settings: VideoExportSettings;
	/** The folder files go to; null sends each to the downloads. */
	folder: FolderTargets | null;
	signal: AbortSignal;
	onStatus: (id: number, status: ItemStatus) => void;
	/** Share of the whole batch done, from 0 to 1. */
	onProgress: (fraction: number) => void;
}

function baseTrack(key: string, kind: MuxTrack['kind']): MuxTrack {
	return {
		key,
		kind,
		number: null,
		subtitle: null,
		codec: '',
		language: 'und',
		name: '',
		default: false,
		forced: false,
		include: true,
		edited: false,
		blocked: null,
		decibels: 0,
		added: null,
	};
}

/** The sound tracks of a file, all kept. */
async function soundTracks(
	file: File,
): Promise<{ tracks: MuxTrack[]; duration: number; upright: { width: number; height: number } | null }> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const [video, audio, duration] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getAudioTracks(),
			input.computeDuration(),
		]);
		const upright = video ? { width: await video.getDisplayWidth(), height: await video.getDisplayHeight() } : null;
		const tracks = await Promise.all(
			audio.map(async (track) => {
				const [codec, language, name, disposition] = await Promise.all([
					track.getCodec(),
					track.getLanguageCode(),
					track.getName(),
					track.getDisposition(),
				]);
				return {
					...baseTrack(`audio-${track.id}`, 'audio'),
					number: track.id,
					codec: codec ? audioCodecName(codec) : '',
					language,
					name: name ?? '',
					default: disposition.default,
				};
			}),
		);
		return { tracks, duration, upright };
	} finally {
		input.dispose();
	}
}

/** The subtitle tracks of a file as documents, with the fonts they use; none when unreadable. */
async function subtitleTracks(
	file: File,
	settings: VideoExportSettings,
): Promise<{ tracks: MuxTrack[]; docs: Map<string, SubtitleDoc>; fonts: Uint8Array[] }> {
	const docs = new Map<string, SubtitleDoc>();
	if (settings.container === 'webm') return { tracks: [], docs, fonts: [] };
	let source: SubtitleSource | null = null;
	try {
		source = await SubtitleSource.open(file);
		const readable = source.tracks.filter((info) => trackKind(info) !== null);
		const extracted = await source.extract(
			readable.map((info) => info.id),
			() => {},
		);
		const tracks: MuxTrack[] = [];
		for (const [index, info] of readable.entries()) {
			const packets = extracted[index];
			// oxlint-disable-next-line no-await-in-loop -- one track at a time keeps memory low
			const doc = packets ? await trackDoc(info, packets).catch(() => null) : null;
			if (!doc) continue;
			const key = `subtitle-${info.id}`;
			docs.set(key, doc);
			tracks.push({
				...baseTrack(key, 'subtitle'),
				number: info.id,
				subtitle: info.id,
				codec: codecLabel(info),
				language: info.language,
				name: info.name,
				default: info.default,
				forced: info.forced,
				// Picture subtitles have no place in MP4.
				blocked: doc.format === 'pgs' && settings.container !== 'mkv' ? 'pgs-mp4' : null,
			});
		}
		const fonts = readable.some((info) => trackKind(info) === 'ass') ? await source.fonts() : [];
		return { tracks, docs, fonts };
	} catch {
		return { tracks: [], docs, fonts: [] };
	} finally {
		source?.close();
	}
}

/**
 * Converts the videos of a batch one after the other, each whole, with the same settings. A file
 * that fails is marked and the batch goes on. Resolves with the number of files exported.
 */
export async function exportVideoBatch(job: VideoBatchJob): Promise<number> {
	const { items, settings, signal } = job;
	const container = CONTAINERS[settings.container];
	const taken = new Set<string>();
	let exported = 0;
	for (const [index, item] of items.entries()) {
		if (signal.aborted) break;
		job.onStatus(item.id, 'working');
		const progress = (share: number) => {
			job.onProgress((index + share) / items.length);
		};
		let save = null;
		try {
			// One file at a time: each is read and written as a stream, but encoders are few.
			// oxlint-disable-next-line no-await-in-loop
			const [sound, subtitles, source] = await Promise.all([
				soundTracks(item.file),
				subtitleTracks(item.file, settings),
				readVideoSource(item.file, item.format),
			]);
			if (!sound.upright || !source) throw new Error('No video');
			// A platform's settings depend on each video: its height, its frame rate.
			// oxlint-disable-next-line no-await-in-loop
			const encodable = settings.preset ? await encodableCodecs(sound.upright) : [];
			const own = settings.preset
				? { ...settings, ...presetSettings(settings.preset, source, encodable, shortSide(sound.upright)) }
				: settings;
			const name = uniqueName(outputName(item.file.name, container.extension), taken);
			const type = { mime: container.mime, extension: container.extension, description: container.label };
			// oxlint-disable-next-line no-await-in-loop
			save = await (job.folder ? job.folder.open(name) : downloadTarget(name, type));
			const tracks = [...sound.tracks, ...subtitles.tracks];
			// oxlint-disable-next-line no-await-in-loop
			await exportConverted(
				{
					file: item.file,
					format: item.format,
					tracks,
					originals: tracks,
					shown: () => {
						throw new Error('No subtitle editor in a batch');
					},
					title: item.file.name.replace(/\.[^.]+$/, ''),
					docs: subtitles.docs,
					fonts: subtitles.fonts,
					doc: createVideoDoc(sound.duration),
					settings: { ...own, mode: 'encode', burn: null, audio: resolveAudio(own, source, false) },
					upright: sound.upright,
				},
				save,
				progress,
				signal,
			);
			// oxlint-disable-next-line no-await-in-loop
			await save.commit();
			exported += 1;
			job.onStatus(item.id, 'done');
		} catch (error) {
			// oxlint-disable-next-line no-await-in-loop
			await save?.discard().catch(() => undefined);
			if (signal.aborted) break;
			console.error(error);
			job.onStatus(item.id, 'failed');
		}
	}
	return exported;
}
