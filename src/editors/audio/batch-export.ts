import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { readPeaks } from '@/media/peaks';
import { outputName, uniqueName } from '@/media/save';
import type { BatchDestination } from '@/media/save-target';
import type { BatchFile } from '@/media/session';
import { type AudioDoc, envelope, keptRanges, resolveGain } from './document';
import { AUDIO_FORMATS, type AudioExportSettings, exportAudio, type SourceFormat } from './export';

export type ItemStatus = 'working' | 'done' | 'failed';

export interface AudioBatchJob {
	items: BatchFile[];
	/** The edits shown in the editor. Trim and cuts belong to one file and are not carried over. */
	template: AudioDoc;
	settings: AudioExportSettings;
	destination: BatchDestination;
	signal: AbortSignal;
	onStatus: (id: number, status: ItemStatus) => void;
	/** Share of the whole batch done, from 0 to 1. */
	onProgress: (fraction: number) => void;
}

async function describe(file: File): Promise<{ duration: number; source: SourceFormat }> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryAudioTrack();
		if (!track) throw new Error('No audio track.');
		const duration = await input.computeDuration();
		return { duration, source: { sampleRate: track.sampleRate, channels: track.numberOfChannels } };
	} finally {
		input.dispose();
	}
}

/**
 * Exports the files of a batch one after the other with the same volume, fades and settings.
 * With normalization, each file is measured first, so all of them end up equally loud; each
 * keeps its own tags and cover. A file that fails is marked and the batch goes on.
 * Resolves with the number of files exported.
 */
export async function exportAudioBatch(job: AudioBatchJob): Promise<number> {
	const { items, settings, signal } = job;
	const info = AUDIO_FORMATS[settings.format];
	const taken = new Set<string>();
	let exported = 0;
	for (const [index, item] of items.entries()) {
		if (signal.aborted) break;
		job.onStatus(item.id, 'working');
		const report = (fraction: number) => {
			job.onProgress((index + fraction) / items.length);
		};
		try {
			// Files are processed one at a time: each already uses several threads while decoding.
			// oxlint-disable-next-line no-await-in-loop
			const { duration, source } = await describe(item.file);
			let doc: AudioDoc = { ...job.template, duration, trim: { start: 0, end: duration }, cuts: [] };
			const measuring = doc.normalize !== null;
			if (measuring) {
				const reader = readPeaks(item.file, duration, () => {
					report(reader.peaks.progress() / 2);
				});
				const stop = () => {
					reader.cancel();
				};
				signal.addEventListener('abort', stop);
				try {
					// oxlint-disable-next-line no-await-in-loop
					await reader.done;
				} finally {
					signal.removeEventListener('abort', stop);
				}
				const unity = { ...doc, gain: 0 };
				doc = resolveGain(doc, reader.loudness.measure(keptRanges(unity), envelope(unity)));
			}
			if (signal.aborted) break;
			const name = uniqueName(outputName(item.file.name, info.extension), taken);
			// oxlint-disable-next-line no-await-in-loop
			const save = await job.destination(name, {
				mime: info.mime,
				extension: info.extension,
				description: info.label,
			});
			// oxlint-disable-next-line no-await-in-loop
			await exportAudio({
				file: item.file,
				doc,
				settings: { ...settings, tags: null, cover: 'keep' },
				source,
				save,
				signal,
				onProgress: (fraction) => {
					report(measuring ? 0.5 + fraction / 2 : fraction);
				},
			});
			exported += 1;
			job.onStatus(item.id, 'done');
		} catch (error) {
			if (signal.aborted) break;
			console.error(error);
			job.onStatus(item.id, 'failed');
		}
	}
	return exported;
}
