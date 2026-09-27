/**
 * Finding and replacing text in the lines, as Aegisub does: in the text as written (markup
 * included), with case, whole words or a regular expression.
 */
import { gridLines, type SubtitleDoc } from './document';

export interface FindQuery {
	text: string;
	matchCase: boolean;
	wholeWord: boolean;
	regex: boolean;
}

/** A match: the line, and where in its text. */
export interface Match {
	id: number;
	index: number;
	length: number;
}

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The query as a regular expression, or null when it is empty or not a valid expression. */
export function queryPattern(query: FindQuery): RegExp | null {
	if (query.text === '') return null;
	let source = query.regex ? query.text : escape(query.text);
	// Letters of any language make up words, not only ASCII ones.
	if (query.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
	try {
		return new RegExp(source, `gu${query.matchCase ? '' : 'i'}`);
	} catch {
		return null;
	}
}

/** Every match, line by line in the grid's order. Empty matches are skipped. */
export function findMatches(doc: SubtitleDoc, query: FindQuery): Match[] {
	const pattern = queryPattern(query);
	if (!pattern) return [];
	const matches: Match[] = [];
	for (const cue of gridLines(doc)) {
		for (const found of cue.text.matchAll(pattern)) {
			if (found[0].length > 0) matches.push({ id: cue.id, index: found.index, length: found[0].length });
		}
	}
	return matches;
}

/** What one match becomes: `$1` and the like refer to groups when searching by expression. */
function replacement(match: string, query: FindQuery, pattern: RegExp, by: string): string {
	if (!query.regex) return by;
	return match.replace(new RegExp(pattern.source, pattern.flags.replace('g', '')), by);
}

/** The document with one match replaced. */
export function replaceMatch(doc: SubtitleDoc, query: FindQuery, match: Match, by: string): SubtitleDoc {
	const pattern = queryPattern(query);
	if (!pattern) return doc;
	return {
		...doc,
		cues: doc.cues.map((cue) => {
			if (cue.id !== match.id) return cue;
			const found = cue.text.slice(match.index, match.index + match.length);
			const text =
				cue.text.slice(0, match.index) +
				replacement(found, query, pattern, by) +
				cue.text.slice(match.index + match.length);
			return { ...cue, text };
		}),
	};
}

/** The document with every match replaced, and how many there were. */
export function replaceAll(doc: SubtitleDoc, query: FindQuery, by: string): { doc: SubtitleDoc; count: number } {
	const pattern = queryPattern(query);
	if (!pattern) return { doc, count: 0 };
	let count = 0;
	const shown = new Set(gridLines(doc).map((cue) => cue.id));
	const cues = doc.cues.map((cue) => {
		if (!shown.has(cue.id)) return cue;
		const text = cue.text.replace(pattern, (found: string) => {
			if (found.length === 0) return found;
			count += 1;
			return replacement(found, query, pattern, by);
		});
		return text === cue.text ? cue : { ...cue, text };
	});
	return { doc: count > 0 ? { ...doc, cues } : doc, count };
}
