import { m } from '@/paraglide/messages.js';
import type { Cue, SubtitleFormat } from './document';
import { plainText } from './formats/markup';

/** What a line shows, for lists and the timeline: its words, or what its picture is. */
export function cueLabel(cue: Cue, format: SubtitleFormat): string {
	if (cue.picture) return cue.picture.forced ? m.subs_picture_forced() : m.subs_picture();
	return plainText(cue.text, format);
}
