import { useEffect, useState } from 'react';
import { audioBitrate } from '@/media/audio-tracks';

/** An audio track to measure: its ID in the list, the file it is in and its ID there (null: the main one). */
export interface BitrateSource {
	key: number;
	file: File;
	id: number | null;
}

const tags = new WeakMap<File, number>();
let tagged = 0;

/** A number telling files apart, for the signature of a list. */
function fileTag(file: File): number {
	let tag = tags.get(file);
	if (tag === undefined) {
		tagged += 1;
		tag = tagged;
		tags.set(file, tag);
	}
	return tag;
}

/** Bitrates of audio tracks in kb/s, by key, filled in as they are measured. */
export function useAudioBitrates(sources: readonly BitrateSource[]): ReadonlyMap<number, number> {
	const [found, setFound] = useState<ReadonlyMap<number, number>>(new Map());
	// The list is rebuilt on every render: it is measured again only when its tracks change.
	const signature = sources.map((source) => `${source.key}:${source.id}:${fileTag(source.file)}`).join(' ');
	useEffect(() => {
		let live = true;
		void Promise.all(
			sources.map(async (source) => [source.key, await audioBitrate(source.file, source.id)] as const),
		).then((measured) => {
			if (!live) return;
			setFound(new Map(measured.flatMap(([key, rate]) => (rate === null ? [] : [[key, rate] as const]))));
		});
		return () => {
			live = false;
		};
		// oxlint-disable-next-line react-hooks/exhaustive-deps -- the signature stands for the sources
	}, [signature]);
	return found;
}
