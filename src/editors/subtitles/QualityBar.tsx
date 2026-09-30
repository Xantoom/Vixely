import { ChevronDown, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { create } from 'zustand';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { Menu } from '@/ui/Menu';
import { gridLines, type SubtitleDoc } from './document';
import { checkLines, hasError, HINTS, type IssueId, type ProfileId, PROFILES, type Rules } from './quality';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Which rules the advice follows: chosen, from the shape of the video, or none at all. */
export type AdviceMode = 'auto' | ProfileId | 'off';

const STORAGE_KEY = 'vixely:subtitle-advice';
const MODES: readonly AdviceMode[] = ['auto', 'film', 'short', 'off'];

function storedMode(): AdviceMode {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		return MODES.find((mode) => mode === saved) ?? 'auto';
	} catch {
		return 'auto';
	}
}

/** The advice chosen, kept between visits. */
export const useAdvice = create<{ mode: AdviceMode; setMode: (mode: AdviceMode) => void }>()((set) => ({
	mode: storedMode(),
	setMode(mode) {
		set({ mode });
		try {
			localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			// Private windows may refuse: the choice then lasts the visit.
		}
	},
}));

/** Whether subtitles are for a picture taller than wide: a TikTok, a Reel, a Short. */
function isVertical(doc: SubtitleDoc, video: { width: number; height: number } | null): boolean {
	const frame = video ?? doc.ass?.playRes ?? null;
	return frame !== null && frame.height > frame.width * 1.1;
}

/** Whether the subtitles shown are for a vertical video, by the video playing or the script's size. */
export function useVertical(): boolean {
	const doc = useSubtitleDoc();
	const video = usePlayback((state) => state.details?.video ?? null);
	return isVertical(doc, video);
}

/** The rules the advice follows now, or null when it is off. */
export function useRules(): { profile: ProfileId; rules: Rules } | null {
	const mode = useAdvice((state) => state.mode);
	const vertical = useVertical();
	if (mode === 'off') return null;
	const profile = mode === 'auto' ? (vertical ? 'short' : 'film') : mode;
	return { profile, rules: PROFILES[profile] };
}

function issueLabel(issue: IssueId, rules: Rules): string {
	switch (issue) {
		case 'empty':
			return m.subs_issue_empty();
		case 'lines':
			return m.subs_issue_lines({ count: rules.maxLines });
		case 'length':
			return m.subs_issue_length({ count: rules.maxLineLength });
		case 'speed':
			return m.subs_issue_speed({ count: rules.maxReadingSpeed });
		case 'short':
			return m.subs_issue_short();
		case 'long':
			return m.subs_issue_long();
		case 'gap':
			return m.subs_issue_gap();
		case 'stack':
			return m.subs_issue_stack({ count: rules.maxLines });
	}
}

/** The issues of every line of the document shown, worked out again when it or the rules change. */
export function useLineIssues(): { issues: Map<number, IssueId[]>; label: (issue: IssueId) => string } {
	const doc = useSubtitleDoc();
	const chosen = useRules();
	const rules = chosen?.rules ?? null;
	return useMemo(
		() => ({
			issues: rules ? checkLines(doc, rules) : new Map<number, IssueId[]>(),
			label: (issue: IssueId) => issueLabel(issue, rules ?? PROFILES.film),
		}),
		[doc, rules],
	);
}

/** What a line breaks of the rules, under its text: what hurts reading first, then what is worth a look. */
export function LineIssues({ issues, label }: { issues: readonly IssueId[]; label: (issue: IssueId) => string }) {
	if (issues.length === 0) return null;
	const sorted = [...issues].sort((a, b) => Number(HINTS.has(a)) - Number(HINTS.has(b)));
	return (
		<ul className="text-small grid gap-0.5" aria-label={m.subs_check_title()}>
			{sorted.map((issue) => (
				<li
					key={issue}
					className={`flex items-start gap-1.5 ${HINTS.has(issue) ? 'text-muted' : 'text-danger'}`}
				>
					<TriangleAlert className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
					{label(issue)}
				</li>
			))}
		</ul>
	);
}

const MODE_LABELS: Record<AdviceMode, () => string> = {
	auto: () => m.subs_advice_auto(),
	film: () => m.subs_advice_film(),
	short: () => m.subs_advice_short(),
	off: () => m.subs_advice_off(),
};

/**
 * Above the lines: how many are hard to read, a way to the next one, and the choice of rules
 * (film and series, short vertical video, from the video's shape) or no advice at all.
 */
export function QualityBar() {
	const doc = useSubtitleDoc();
	const { issues } = useLineIssues();
	const chosen = useRules();
	const mode = useAdvice((state) => state.mode);
	const setMode = useAdvice((state) => state.setMode);
	const active = useSubtitleEditor((state) => state.active);
	const select = useSubtitleEditor((state) => state.select);
	const flagged = [...issues.values()].filter(hasError).length;
	const lines = gridLines(doc);
	const next = () => {
		const from = Math.max(
			-1,
			lines.findIndex((line) => line.id === active),
		);
		const order = lines.map((_, index) => lines[(from + 1 + index) % lines.length]);
		const found = order.find((line) => line && hasError(issues.get(line.id)));
		if (!found) return;
		select([found.id], found.id);
		usePlayback.getState().seek(found.start / 1000);
	};
	return (
		<div className="text-small flex h-9 min-w-0 flex-none items-center gap-1.5">
			{chosen === null ? (
				<span className="text-muted min-w-0 flex-1 truncate pl-1">{m.subs_advice_disabled()}</span>
			) : flagged > 0 ? (
				<>
					<TriangleAlert className="text-danger ml-1 size-4 flex-none" aria-hidden="true" />
					<span className="min-w-0 flex-1 truncate font-medium" title={m.subs_check_title()}>
						{m.subs_check_count({ count: flagged })}
					</span>
					<button
						type="button"
						onClick={next}
						className="hover:bg-surface flex h-8 flex-none items-center gap-1 rounded-sm px-2 font-medium transition-colors"
					>
						{m.subs_check_next()}
						<ChevronDown className="size-4" aria-hidden="true" />
					</button>
				</>
			) : (
				<span className="text-muted min-w-0 flex-1 truncate pl-1" title={m.subs_check_title()}>
					{m.subs_check_none()}
				</span>
			)}
			<Menu
				label={m.subs_advice()}
				value={mode}
				items={MODES.map((value) => ({
					value,
					label: MODE_LABELS[value](),
					detail: value === 'auto' && chosen && mode === 'auto' ? MODE_LABELS[chosen.profile]() : undefined,
				}))}
				onChange={setMode}
				buttonClassName="h-8! min-w-8! text-muted"
			>
				<SlidersHorizontal className="size-4" aria-hidden="true" />
			</Menu>
		</div>
	);
}
