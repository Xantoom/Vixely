import {
	ArrowDownToLine,
	Bold,
	Copy,
	Italic,
	ListPlus,
	Merge,
	Scissors,
	Strikethrough,
	Trash2,
	Underline,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatPreciseTime, parseTime } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import {
	type Cue,
	duplicateCue,
	findCue,
	insertAfter,
	joinWithNext,
	MIN_CUE,
	removeCues,
	setCueTimes,
	gridLines,
	splitCue,
	type SubtitleDoc,
	type SubtitleFormat,
	updateCue,
} from './document';
import { plainText } from './formats/markup';
import { PicturePreview } from './PicturePreview';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Above this many characters per second, most people can't finish reading. */
export const FAST_READING = 20;

/** Characters shown per second. */
export function readingSpeed(cue: Cue, format: SubtitleFormat): number {
	const characters = plainText(cue.text, format)
		.replace(/\s*\n\s*/g, ' ')
		.trim().length;
	return characters / Math.max(0.001, (cue.end - cue.start) / 1000);
}

/** Opening and closing markup of a style, in the document's format. */
function styleTags(format: SubtitleFormat, style: 'b' | 'i' | 'u' | 's'): [string, string] {
	if (format === 'ass') return [`{\\${style}1}`, `{\\${style}0}`];
	return [`<${style}>`, `</${style}>`];
}

/** A time typed over, like Aegisub's time boxes: committed on Enter or when leaving. */
function TimeBox({
	label,
	value,
	onCommit,
	disabled,
}: {
	label: string;
	value: number;
	onCommit: (seconds: number) => void;
	disabled?: boolean;
}) {
	const ref = useRef<HTMLInputElement>(null);
	const shown = formatPreciseTime(value);
	useEffect(() => {
		if (ref.current && document.activeElement !== ref.current) ref.current.value = shown;
	}, [shown]);
	const commit = () => {
		const input = ref.current;
		if (!input) return;
		const parsed = parseTime(input.value);
		if (parsed === null) input.value = shown;
		else if (Math.abs(parsed - value) > 0.0005) onCommit(parsed);
	};
	return (
		<input
			ref={ref}
			aria-label={label}
			title={label}
			defaultValue={shown}
			disabled={disabled}
			inputMode="decimal"
			spellCheck={false}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') {
					commit();
					event.currentTarget.select();
				}
				if (event.key === 'Escape') event.currentTarget.value = shown;
			}}
			className="border-line-2 bg-bg text-ink hover:border-muted tabular h-8 w-[104px] rounded-xs border px-2 font-mono text-[12.5px] transition-colors disabled:opacity-45"
		/>
	);
}

function useActiveCue(doc: SubtitleDoc): Cue | undefined {
	const active = useSubtitleEditor((state) => state.active);
	return active === null ? undefined : findCue(doc, active);
}

/** Goes to the next line; at the last one, adds a line after it, as Aegisub does on Enter. */
export function nextLine() {
	const state = useSubtitleEditor.getState();
	const doc = state.history.present;
	const lines = gridLines(doc);
	const index = lines.findIndex((line) => line.id === state.active);
	const next = lines[index + 1];
	if (next) {
		state.select([next.id]);
		return;
	}
	const current = lines[index];
	if (!current || current.picture) return;
	let created = 0;
	state.apply((present) => {
		const result = insertAfter(present, current.id);
		created = result.id;
		return result.doc;
	});
	state.select([created]);
}

/**
 * The line being edited, under the audio box as in Aegisub: its times, its style and its text.
 * Typing shows at once on the video; Enter goes to the next line, Shift+Enter breaks the line.
 */
export function EditBox() {
	const doc = useSubtitleDoc();
	const cue = useActiveCue(doc);
	const apply = useSubtitleEditor((state) => state.apply);
	const preview = useSubtitleEditor((state) => state.preview);
	const settle = useSubtitleEditor((state) => state.settle);
	const select = useSubtitleEditor((state) => state.select);
	const textRef = useRef<HTMLTextAreaElement>(null);
	const lines = gridLines(doc);
	const index = cue ? lines.findIndex((line) => line.id === cue.id) : -1;
	const speed = cue && !cue.picture ? readingSpeed(cue, doc.format) : 0;
	const styles = doc.ass?.styles ?? [];

	const change = (edit: (present: SubtitleDoc, line: Cue) => SubtitleDoc) => {
		if (cue) apply((present) => edit(present, cue));
	};

	const wrap = (style: 'b' | 'i' | 'u' | 's') => {
		const area = textRef.current;
		if (!cue || !area) return;
		const [open, close] = styleTags(doc.format, style);
		const { selectionStart: from, selectionEnd: to, value } = area;
		const text = value.slice(0, from) + open + value.slice(from, to) + close + value.slice(to);
		apply((present) => updateCue(present, cue.id, { text }));
		requestAnimationFrame(() => {
			area.focus();
			area.setSelectionRange(from + open.length, to + open.length);
		});
	};

	return (
		<section aria-label={m.subs_line_editor()} className="flex h-full min-h-0 flex-col gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-caption text-muted tabular w-10 font-mono" title={m.subs_line_number()}>
					{index >= 0 ? `#${index + 1}` : '–'}
				</span>
				<TimeBox
					label={m.trim_start()}
					value={(cue?.start ?? 0) / 1000}
					disabled={!cue}
					onCommit={(seconds) => {
						change((present, line) =>
							setCueTimes(present, line.id, seconds * 1000, Math.max(line.end, seconds * 1000 + MIN_CUE)),
						);
					}}
				/>
				<TimeBox
					label={m.trim_end()}
					value={(cue?.end ?? 0) / 1000}
					disabled={!cue}
					onCommit={(seconds) => {
						change((present, line) => setCueTimes(present, line.id, line.start, seconds * 1000));
					}}
				/>
				<TimeBox
					label={m.info_duration()}
					value={cue ? (cue.end - cue.start) / 1000 : 0}
					disabled={!cue}
					onCommit={(seconds) => {
						change((present, line) =>
							setCueTimes(present, line.id, line.start, line.start + seconds * 1000),
						);
					}}
				/>
				<IconButton
					label={m.subs_times_here()}
					disabled={!cue}
					onClick={() => {
						const time = usePlayback.getState().time * 1000;
						change((present, line) =>
							setCueTimes(present, line.id, time, time + Math.max(line.end - line.start, MIN_CUE)),
						);
					}}
				>
					<ArrowDownToLine size={16} />
				</IconButton>
				{cue && !cue.picture && (
					<span
						title={m.subs_reading_speed()}
						className={`text-caption tabular rounded-xs px-1.5 py-1 font-mono ${
							speed > FAST_READING ? 'bg-danger text-white' : 'text-muted'
						}`}
					>
						{m.subs_cps({ value: speed.toFixed(1) })}
					</span>
				)}
				{cue && styles.length > 0 && (
					<select
						aria-label={m.subs_style()}
						title={m.subs_style()}
						value={cue.fields?.style ?? 'Default'}
						onChange={(event) => {
							const style = event.target.value;
							change((present, line) =>
								updateCue(present, line.id, { fields: { ...line.fields, style } }),
							);
						}}
						className="border-line-2 bg-bg text-ui hover:border-muted h-8 max-w-40 min-w-0 cursor-pointer rounded-xs border px-2"
					>
						{[...new Set([...styles, cue.fields?.style ?? 'Default'])].map((style) => (
							<option key={style} value={style}>
								{style}
							</option>
						))}
					</select>
				)}
				{cue && doc.format === 'ass' && (
					<input
						aria-label={m.subs_actor()}
						title={m.subs_actor()}
						placeholder={m.subs_actor()}
						value={cue.fields?.name ?? ''}
						onChange={(event) => {
							const name = event.target.value;
							preview((present) => updateCue(present, cue.id, { fields: { ...cue.fields, name } }));
						}}
						onBlur={settle}
						className="border-line-2 bg-bg text-ui hover:border-muted h-8 w-28 min-w-0 rounded-xs border px-2"
					/>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-0.5">
				{!cue?.picture && (
					<>
						<IconButton
							label={m.subs_bold()}
							disabled={!cue}
							onClick={() => {
								wrap('b');
							}}
						>
							<Bold size={16} />
						</IconButton>
						<IconButton
							label={m.subs_italic()}
							disabled={!cue}
							onClick={() => {
								wrap('i');
							}}
						>
							<Italic size={16} />
						</IconButton>
						<IconButton
							label={m.subs_underline()}
							disabled={!cue}
							onClick={() => {
								wrap('u');
							}}
						>
							<Underline size={16} />
						</IconButton>
						<IconButton
							label={m.subs_strike()}
							disabled={!cue}
							onClick={() => {
								wrap('s');
							}}
						>
							<Strikethrough size={16} />
						</IconButton>
						<span className="bg-line mx-1 h-5 w-px" aria-hidden="true" />
					</>
				)}
				<IconButton
					label={m.subs_insert_after()}
					disabled={!cue || !!cue.picture}
					onClick={() => {
						let created = 0;
						change((present, line) => {
							const result = insertAfter(present, line.id);
							created = result.id;
							return result.doc;
						});
						select([created]);
						requestAnimationFrame(() => textRef.current?.focus());
					}}
				>
					<ListPlus size={16} />
				</IconButton>
				<IconButton
					label={m.subs_duplicate()}
					disabled={!cue}
					onClick={() => {
						let created = 0;
						change((present, line) => {
							const result = duplicateCue(present, line.id);
							created = result.id;
							return result.doc;
						});
						select([created]);
					}}
				>
					<Copy size={16} />
				</IconButton>
				<IconButton
					label={m.subs_split()}
					disabled={!cue || !!cue.picture}
					onClick={() => {
						const at = usePlayback.getState().time * 1000;
						const caret = textRef.current?.selectionStart ?? cue?.text.length ?? 0;
						let created = 0;
						change((present, line) => {
							const result = splitCue(present, line.id, at, caret);
							created = result.id;
							return result.doc;
						});
						if (created) select([created]);
					}}
				>
					<Scissors size={16} />
				</IconButton>
				<IconButton
					label={m.subs_join()}
					disabled={!cue || !!cue.picture || index >= lines.length - 1}
					onClick={() => {
						change((present, line) => joinWithNext(present, line.id));
					}}
				>
					<Merge size={16} />
				</IconButton>
				<IconButton
					label={m.subs_delete_line()}
					disabled={!cue}
					onClick={() => {
						const next = lines[index + 1] ?? lines[index - 1];
						change((present, line) => removeCues(present, new Set([line.id])));
						select(next ? [next.id] : []);
					}}
				>
					<Trash2 size={16} />
				</IconButton>
			</div>
			{cue?.picture ? (
				<PicturePreview picture={cue.picture} />
			) : (
				<textarea
					ref={textRef}
					aria-label={m.subs_text()}
					value={cue?.text ?? ''}
					disabled={!cue}
					spellCheck
					onChange={(event) => {
						const text = event.target.value;
						// Typing is previewed at once and becomes one undo step when the field is left.
						if (cue) preview((present) => updateCue(present, cue.id, { text }));
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
							event.preventDefault();
							settle();
							nextLine();
						} else if (event.key === 'Enter' && event.shiftKey && doc.format === 'ass') {
							// ASS breaks lines with \N, not a real line break.
							event.preventDefault();
							const area = event.currentTarget;
							const { selectionStart: from, selectionEnd: to, value } = area;
							const text = `${value.slice(0, from)}\\N${value.slice(to)}`;
							if (cue) preview((present) => updateCue(present, cue.id, { text }));
							requestAnimationFrame(() => {
								area.setSelectionRange(from + 2, from + 2);
							});
						}
					}}
					onBlur={settle}
					className="border-line-2 bg-bg text-body text-ink hover:border-muted min-h-16 w-full flex-1 resize-none rounded-xs border px-2.5 py-2 transition-colors disabled:opacity-45"
				/>
			)}
		</section>
	);
}
