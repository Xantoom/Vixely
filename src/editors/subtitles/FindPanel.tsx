import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { Switch } from '@/ui/fields';
import { findCue } from './document';
import { type FindQuery, findMatches, queryPattern, replaceAll, replaceMatch } from './find';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Kept while the panel closes and opens again, as Aegisub's dialog keeps its last search. */
let lastQuery: FindQuery = { text: '', matchCase: false, wholeWord: false, regex: false };
let lastReplacement = '';

/**
 * Finds text in the lines and replaces it: one match at a time, each shown in the grid and the
 * edit box, or all at once. Enter goes to the next match, Shift + Enter to the previous one.
 */
export function FindPanel() {
	const doc = useSubtitleDoc();
	const apply = useSubtitleEditor((state) => state.apply);
	const select = useSubtitleEditor((state) => state.select);
	const active = useSubtitleEditor((state) => state.active);
	const [query, setQuery] = useState(lastQuery);
	const [by, setBy] = useState(lastReplacement);
	// The match shown, by its place in the list.
	const [current, setCurrent] = useState<number | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	// After a replacement, the match now in the same place is shown once the list is found again.
	const follow = useRef<number | null>(null);
	lastQuery = query;
	lastReplacement = by;

	const matches = useMemo(() => findMatches(doc, query), [doc, query]);
	const invalid = query.text !== '' && queryPattern(query) === null;
	const shown = current !== null && current < matches.length ? current : null;

	// Focused on opening, and again with Ctrl + F while open.
	useEffect(() => {
		const focus = () => {
			inputRef.current?.focus();
			inputRef.current?.select();
		};
		focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') focus();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, []);

	const go = (index: number) => {
		if (matches.length === 0) return;
		const at = ((index % matches.length) + matches.length) % matches.length;
		const match = matches[at];
		if (!match) return;
		setCurrent(at);
		select([match.id], match.id);
		const cue = findCue(doc, match.id);
		if (cue && !usePlayback.getState().playing) usePlayback.getState().seek(cue.start / 1000);
	};
	// The next match after the line shown, or the first.
	const next = (step: 1 | -1) => {
		if (shown !== null) {
			go(shown + step);
			return;
		}
		const lineIndex = matches.findIndex((match) => match.id === active);
		go(lineIndex >= 0 ? lineIndex : step === 1 ? 0 : -1);
	};

	useEffect(() => {
		const at = follow.current;
		if (at === null) return;
		follow.current = null;
		if (matches.length === 0) setCurrent(null);
		else go(Math.min(at, matches.length - 1));
		// Runs when the matches change after a replacement, with the `go` of that render.
		// oxlint-disable-next-line react-hooks/exhaustive-deps
	}, [matches]);

	const change = (patch: Partial<FindQuery>) => {
		setQuery((before) => ({ ...before, ...patch }));
		setCurrent(null);
	};

	const status = invalid
		? m.find_invalid()
		: query.text === ''
			? ''
			: matches.length === 0
				? m.find_none()
				: m.find_count({ current: shown === null ? '–' : String(shown + 1), count: String(matches.length) });

	return (
		<>
			<PanelTitle>{m.tool_find()}</PanelTitle>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<label htmlFor="find-text" className="text-ui text-ink-2">
						{m.find_text()}
					</label>
					<div className="flex items-center gap-1">
						<input
							ref={inputRef}
							id="find-text"
							type="text"
							value={query.text}
							spellCheck={false}
							aria-invalid={invalid}
							onChange={(event) => {
								change({ text: event.target.value });
							}}
							onKeyDown={(event) => {
								if (event.key !== 'Enter') return;
								event.preventDefault();
								next(event.shiftKey ? -1 : 1);
							}}
							className="border-line-2 bg-bg text-ui text-ink hover:border-muted aria-invalid:border-danger h-8 w-0 min-w-0 flex-1 rounded-xs border px-2.5 font-mono transition-colors"
						/>
						<IconButton
							label={m.find_previous()}
							disabled={matches.length === 0}
							onClick={() => {
								next(-1);
							}}
						>
							<ChevronUp size={17} />
						</IconButton>
						<IconButton
							label={m.find_next()}
							disabled={matches.length === 0}
							onClick={() => {
								next(1);
							}}
						>
							<ChevronDown size={17} />
						</IconButton>
					</div>
					<p
						role="status"
						className={`text-small tabular min-h-5 font-mono ${invalid ? 'text-danger' : 'text-muted'}`}
					>
						{status}
					</p>
				</div>
				<div className="grid gap-0.5">
					<Switch
						label={m.find_case()}
						checked={query.matchCase}
						onChange={(matchCase) => {
							change({ matchCase });
						}}
					/>
					<Switch
						label={m.find_word()}
						checked={query.wholeWord}
						onChange={(wholeWord) => {
							change({ wholeWord });
						}}
					/>
					<Switch
						label={m.find_regex()}
						checked={query.regex}
						onChange={(regex) => {
							change({ regex });
						}}
					/>
				</div>
				<div className="grid gap-1.5">
					<label htmlFor="find-replace" className="text-ui text-ink-2">
						{m.find_replace_with()}
					</label>
					<input
						id="find-replace"
						type="text"
						value={by}
						spellCheck={false}
						onChange={(event) => {
							setBy(event.target.value);
						}}
						className="border-line-2 bg-bg text-ui text-ink hover:border-muted h-8 w-full rounded-xs border px-2.5 font-mono transition-colors"
					/>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button
						disabled={shown === null}
						onClick={() => {
							const match = shown === null ? undefined : matches[shown];
							if (!match) return;
							follow.current = shown;
							apply((before) => replaceMatch(before, query, match, by));
						}}
					>
						{m.find_replace_one()}
					</Button>
					<Button
						disabled={matches.length === 0}
						onClick={() => {
							apply((before) => replaceAll(before, query, by).doc);
							setCurrent(null);
						}}
					>
						{m.find_replace_all({ count: String(matches.length) })}
					</Button>
				</div>
			</div>
		</>
	);
}
