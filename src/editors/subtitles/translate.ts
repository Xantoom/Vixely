import type { SubtitleDoc } from './document';
import { newCueId } from './document';
import { plainText } from './formats/markup';
import type { NewTrack, TrackKey } from './project';

/**
 * A translation to write by hand: every line of `source` with its times, style and position, and
 * no text yet. Each keeps the original text by its id, to show beside the one being typed.
 */
export function translationTrack(source: SubtitleDoc, key: TrackKey, language: string): NewTrack {
	const texts = new Map<number, string>();
	const cues = source.cues.map((cue) => {
		const id = newCueId();
		if (!cue.comment) texts.set(id, plainText(cue.text, source.format));
		return { ...cue, id, text: cue.comment ? cue.text : '' };
	});
	return { doc: { ...source, cues }, language, origin: { key, texts } };
}

/** Lines of a translation still without text. */
export function untranslated(doc: SubtitleDoc, texts: ReadonlyMap<number, string>): number {
	return doc.cues.filter((cue) => texts.has(cue.id) && cue.text.trim() === '').length;
}
