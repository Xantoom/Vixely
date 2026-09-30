import { ArrowDownToLine, Bold, Italic, type LucideIcon, MoreHorizontal, Strikethrough, Underline } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { decimal, formatPreciseTime, parseTime } from '@/lib/format';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { Dropdown } from '@/ui/Dropdown';
import { Menu } from '@/ui/Menu';
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
import { useOrigin } from './project';
import { LineIssues, useLineIssues, useRules } from './QualityBar';
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

type LineAction = 'insert' | 'duplicate' | 'split' | 'join' | 'delete';

const STYLE_ICONS: Record<'b' | 'i' | 'u' | 's', LucideIcon> = { b: Bold, i: Italic, u: Underline, s: Strikethrough };

const STYLE_LABELS: Record<'b' | 'i' | 'u' | 's', () => string> = {
	b: () => m.subs_bold(),
	i: () => m.subs_italic(),
	u: () => m.subs_underline(),
	s: () => m.subs_strike(),
};

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
		<label className="grid gap-0.5 max-sm:min-w-0 max-sm:flex-1">
			<span className="text-caption text-muted">{label}</span>
			<input
				ref={ref}
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
				className="border-line-2 bg-bg text-ink hover:border-muted tabular text-small h-8 w-[104px] rounded-xs max-sm:w-full max-sm:px-1.5 border px-2 transition-colors disabled:opacity-45"
			/>
		</label>
	);
}

function useActiveCue(doc: SubtitleDoc): Cue | undefined {
	const active = useSubtitleEditor((state) => state.active);
	return active === null ? undefined : findCue(doc, active);
}

/** Goes to the next line; at the last one, adds a line after it, as Aegisub does on Enter. */
function nextLine() {
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
 * The line being edited, as a card: its times, then its text with its formatting, then its style,
 * actor and what can be done with it.
 * Typing shows at once on the video; Enter goes to the next line, Shift+Enter breaks the line.
 */
export function EditBox() {
	const doc = useSubtitleDoc();
	const cue = useActiveCue(doc);
	const { issues, label } = useLineIssues();
	const chosen = useRules();
	const apply = useSubtitleEditor((state) => state.apply);
	const preview = useSubtitleEditor((state) => state.preview);
	const settle = useSubtitleEditor((state) => state.settle);
	const select = useSubtitleEditor((state) => state.select);
	const textRef = useRef<HTMLTextAreaElement>(null);
	const origin = useOrigin();
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

	const lineActions = (action: LineAction) => {
		if (action === 'insert') {
			let created = 0;
			change((present, line) => {
				const result = insertAfter(present, line.id);
				created = result.id;
				return result.doc;
			});
			select([created]);
			requestAnimationFrame(() => textRef.current?.focus());
		} else if (action === 'duplicate') {
			let created = 0;
			change((present, line) => {
				const result = duplicateCue(present, line.id);
				created = result.id;
				return result.doc;
			});
			select([created]);
		} else if (action === 'split') {
			const at = usePlayback.getState().time * 1000;
			const caret = textRef.current?.selectionStart ?? cue?.text.length ?? 0;
			let created = 0;
			change((present, line) => {
				const result = splitCue(present, line.id, at, caret);
				created = result.id;
				return result.doc;
			});
			if (created) select([created]);
		} else if (action === 'join') {
			change((present, line) => joinWithNext(present, line.id));
		} else {
			const next = lines[index + 1] ?? lines[index - 1];
			change((present, line) => removeCues(present, new Set([line.id])));
			select(next ? [next.id] : []);
		}
	};
	const picture = Boolean(cue?.picture);
	const characters =
		cue && !picture
			? plainText(cue.text, doc.format)
					.replace(/\s*\n\s*/g, ' ')
					.trim().length
			: 0;

	return (
		<section
			aria-label={m.subs_line_editor()}
			className="bg-bg flex h-full min-h-0 flex-col gap-3 rounded-md p-3.5 shadow-[inset_0_0_0_1px_var(--line)] max-lg:rounded-none max-lg:shadow-none"
		>
			<div className="flex flex-wrap items-end gap-x-2 gap-y-2">
				<p
					className="text-ui mr-1 grid h-8 items-center font-semibold whitespace-nowrap"
					title={m.subs_line_number()}
				>
					{index >= 0 ? m.subs_line_title({ number: index + 1 }) : m.subs_line_none()}
				</p>
				<div className="flex min-w-0 flex-1 flex-wrap items-end justify-end gap-1.5 max-sm:justify-start">
					<TimeBox
						label={m.trim_start()}
						value={(cue?.start ?? 0) / 1000}
						disabled={!cue}
						onCommit={(seconds) => {
							change((present, line) =>
								setCueTimes(
									present,
									line.id,
									seconds * 1000,
									Math.max(line.end, seconds * 1000 + MIN_CUE),
								),
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
						className="size-8"
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
				</div>
			</div>
			{cue && origin?.has(cue.id) && (
				<p
					aria-label={m.subs_original()}
					className="bg-surface text-body text-ink-2 max-h-20 overflow-auto rounded-sm px-3 py-2 whitespace-pre-wrap"
				>
					{origin.get(cue.id)}
				</p>
			)}
			{picture && cue?.picture ? (
				<PicturePreview picture={cue.picture} />
			) : (
				<div className="border-line-2 focus-within:border-ed hover:border-muted flex min-h-28 flex-1 flex-col rounded-sm border transition-colors">
					<div className="border-line flex items-center gap-0.5 border-b px-1 py-0.5">
						{(['b', 'i', 'u', 's'] as const).map((style) => {
							const Icon = STYLE_ICONS[style];
							return (
								<IconButton
									key={style}
									label={STYLE_LABELS[style]()}
									className="size-8"
									disabled={!cue}
									onClick={() => {
										wrap(style);
									}}
								>
									<Icon size={15} />
								</IconButton>
							);
						})}
						<span className="flex-1" />
						{cue && (
							<span className="text-caption tabular text-muted px-2 whitespace-nowrap">
								{m.subs_characters({ count: characters })}
								{' · '}
								<span
									title={m.subs_reading_speed()}
									className={
										speed > (chosen?.rules.maxReadingSpeed ?? FAST_READING)
											? 'text-danger font-semibold'
											: ''
									}
								>
									{m.subs_cps({ value: decimal(speed, 1) })}
								</span>
							</span>
						)}
					</div>
					<textarea
						ref={textRef}
						aria-label={m.subs_text()}
						value={cue?.text ?? ''}
						disabled={!cue}
						spellCheck
						placeholder={cue ? undefined : m.subs_line_pick()}
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
						className="text-ink placeholder:text-muted min-h-16 w-full flex-1 resize-none bg-transparent px-3 py-2.5 text-[1.0625rem] leading-snug outline-none disabled:opacity-45"
					/>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-2">
				{cue && styles.length > 0 && (
					<div className="w-44 min-w-0 max-sm:flex-1">
						<Dropdown
							label={m.subs_style()}
							value={cue.fields?.style ?? 'Default'}
							options={[...new Set([...styles, cue.fields?.style ?? 'Default'])].map((style) => ({
								value: style,
								label: style,
							}))}
							onChange={(style) => {
								change((present, line) =>
									updateCue(present, line.id, { fields: { ...line.fields, style } }),
								);
							}}
						/>
					</div>
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
						className="border-line-2 bg-bg text-ui hover:border-muted placeholder:text-muted h-10 w-36 min-w-0 rounded-xs border px-2.5 transition-colors max-sm:flex-1"
					/>
				)}
				<span className="flex-1" />
				<Menu
					label={m.subs_line_actions()}
					value={null}
					items={[
						{ value: 'insert', label: m.subs_insert_after(), disabled: !cue || picture },
						{ value: 'duplicate', label: m.subs_duplicate(), disabled: !cue },
						{ value: 'split', label: m.subs_split(), disabled: !cue || picture },
						{ value: 'join', label: m.subs_join(), disabled: !cue || picture || index >= lines.length - 1 },
						{ value: 'delete', label: m.subs_delete_line(), disabled: !cue },
					]}
					onChange={lineActions}
					buttonClassName="h-10! px-3 gap-2 text-ui font-medium shadow-[inset_0_0_0_1px_var(--line-2)] flex! items-center"
				>
					<MoreHorizontal className="size-4" aria-hidden="true" />
					{m.subs_line_actions()}
				</Menu>
			</div>
			{cue && <LineIssues issues={issues.get(cue.id) ?? []} label={label} />}
		</section>
	);
}
