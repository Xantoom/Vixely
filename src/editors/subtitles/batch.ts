/**
 * Subtitle files processed together, as Subtitle Edit's batch convert does: every file shifted
 * and moved to another frame rate the same way, then written in one format.
 */
import { create } from 'zustand';
import type { FileDestination } from '@/media/file-destination';
import { outputName, uniqueName } from '@/media/save';
import { FRAME_RATES, retime, shownCues, type SubtitleDoc, type SubtitleFormat } from './document';
import { FORMAT_FILES, parseSubtitles, writeSubtitles } from './formats';
import { decodeText, detectEncoding } from './formats/encoding';
import { writeSup } from './pgs';
import { supDoc } from './tracks';

/** A frame rate from the list, by its label; null leaves times as they are. */
export type RateLabel = (typeof FRAME_RATES)[number]['label'];

export interface BatchSettings {
	/** Milliseconds added to every line. */
	shift: number;
	/** Converts times from one frame rate to another, when both are set and differ. */
	fromRate: RateLabel;
	toRate: RateLabel;
	/** Each file keeps its format, or all become one. */
	format: 'source' | Exclude<SubtitleFormat, 'pgs'>;
}

interface BatchState extends BatchSettings {
	set: (change: Partial<BatchSettings>) => void;
}

export const useSubtitleBatch = create<BatchState>((set) => ({
	shift: 0,
	fromRate: '25',
	toRate: '25',
	format: 'source',
	set(change) {
		set(change);
	},
}));

/** A file of the batch, read. */
export type ReadFile = { doc: SubtitleDoc } | { doc: null };

export async function readSubtitleFile(file: File, format: string): Promise<ReadFile> {
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (format === 'pgs') {
			const doc = await supDoc(bytes);
			return { doc: doc.cues.length > 0 ? doc : null };
		}
		return { doc: parseSubtitles(decodeText(bytes, detectEncoding(bytes))) };
	} catch {
		return { doc: null };
	}
}

function rate(label: RateLabel): number {
	return FRAME_RATES.find((option) => option.label === label)?.value ?? 25;
}

/** The document with the batch's timing applied: frame rate first, then the shift. */
export function applyTiming(doc: SubtitleDoc, settings: BatchSettings): SubtitleDoc {
	const scale = settings.fromRate === settings.toRate ? 1 : rate(settings.fromRate) / rate(settings.toRate);
	return retime(retime(doc, scale, 0), 1, settings.shift);
}

/** The format a file is written in: pictures stay pictures, whatever is asked. */
export function outputFormat(doc: SubtitleDoc, settings: BatchSettings): SubtitleFormat {
	if (doc.format === 'pgs' || settings.format === 'source') return doc.format;
	return settings.format;
}

/** When the first line starts, in milliseconds, or null without lines. */
export function firstStart(doc: SubtitleDoc): number | null {
	return shownCues(doc)[0]?.start ?? null;
}

async function writeFile(doc: SubtitleDoc, format: SubtitleFormat, title: string): Promise<Blob> {
	const { mime } = FORMAT_FILES[format];
	if (format === 'pgs') return new Blob([(await writeSup(doc)).slice()], { type: mime });
	const text = writeSubtitles(doc, format, title);
	// A byte order mark tells older players and Windows programs the file is UTF-8.
	return new Blob([format === 'vtt' ? text : `﻿${text}`], { type: mime });
}

export interface BatchJob {
	items: { id: number; file: File; read: ReadFile }[];
	settings: BatchSettings;
	destination: FileDestination;
	signal: AbortSignal;
	onStatus: (id: number, status: 'working' | 'done' | 'failed') => void;
}

/** Writes every readable file; resolves with how many were written. */
export async function exportSubtitleBatch({ items, settings, destination, signal, onStatus }: BatchJob) {
	const taken = new Set<string>();
	let written = 0;
	for (const item of items) {
		if (signal.aborted) break;
		const { doc } = item.read;
		if (!doc) {
			onStatus(item.id, 'failed');
			continue;
		}
		onStatus(item.id, 'working');
		try {
			const format = outputFormat(doc, settings);
			const name = uniqueName(outputName(item.file.name, FORMAT_FILES[format].extension, ['ssa']), taken);
			// oxlint-disable-next-line no-await-in-loop -- one file at a time, in the list's order
			const blob = await writeFile(applyTiming(doc, settings), format, name.replace(/\.[^.]+$/, ''));
			// oxlint-disable-next-line no-await-in-loop
			await destination.write(name, blob);
			onStatus(item.id, 'done');
			written += 1;
		} catch {
			onStatus(item.id, 'failed');
		}
	}
	await destination.finish();
	return written;
}
