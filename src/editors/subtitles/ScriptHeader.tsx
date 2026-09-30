import { Plus, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Group } from '@/editor/panel-parts';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { FieldRow, NumberField, Select, Switch } from '@/ui/fields';
import { Menu } from '@/ui/Menu';
import { defaultGenerator, readScriptInfo, type ScriptEntry, withScriptInfo } from './formats/ass';
import { useSubtitleDoc, useSubtitleEditor } from './store';

/** Credits every script shows, whether the file has them or not. */
const CREDITS = ['Title', 'Original Script', 'Script Updated By', 'Update Details'] as const;
/** Credits offered to add, as Aegisub's script properties list them. */
const MORE_CREDITS = ['Original Translation', 'Original Editing', 'Original Timing', 'Synch Point'] as const;
/** Fields with their own controls below the credits. */
const RENDERING = ['PlayResX', 'PlayResY', 'WrapStyle', 'ScaledBorderAndShadow', 'YCbCr Matrix'] as const;
/** Fields the editor writes itself and doesn't offer to change. */
const FIXED = ['ScriptType'];

const MATRICES = ['None', 'TV.601', 'PC.601', 'TV.709', 'PC.709', 'TV.FCC', 'PC.FCC', 'TV.240M', 'PC.240M'];

const CREDIT_LABELS: Record<string, () => string> = {
	Title: () => m.subs_head_title(),
	'Original Script': () => m.subs_head_original_script(),
	'Script Updated By': () => m.subs_head_updated_by(),
	'Update Details': () => m.subs_head_update_details(),
	'Original Translation': () => m.subs_head_original_translation(),
	'Original Editing': () => m.subs_head_original_editing(),
	'Original Timing': () => m.subs_head_original_timing(),
	'Synch Point': () => m.subs_head_synch_point(),
};

function same(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

/** Free text applied when leaving the field or on Enter, so each field is one undo step. */
function CommitText({
	label,
	value,
	placeholder,
	onCommit,
	onRemove,
}: {
	label: string;
	value: string;
	placeholder?: string;
	onCommit: (value: string) => void;
	onRemove?: () => void;
}) {
	const id = useId();
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		if (draft !== null && draft !== value) onCommit(draft);
		setDraft(null);
	};
	return (
		<div className="grid gap-1.5">
			<div className="flex min-h-5 items-center justify-between gap-2">
				<label htmlFor={id} className="text-ui text-ink-2 truncate">
					{label}
				</label>
				{onRemove && (
					<IconButton
						label={m.subs_head_remove({ name: label })}
						onClick={onRemove}
						className="-my-1.5 -mr-2"
					>
						<X size={14} aria-hidden="true" />
					</IconButton>
				)}
			</div>
			<input
				id={id}
				type="text"
				value={draft ?? value}
				placeholder={placeholder}
				onChange={(event) => {
					setDraft(event.target.value);
				}}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === 'Enter') commit();
					if (event.key === 'Escape') setDraft(null);
				}}
				className="border-line-2 bg-bg text-ui text-ink hover:border-muted placeholder:text-muted h-8 w-full min-w-0 cursor-text rounded-xs border px-2.5 transition-colors"
			/>
		</div>
	);
}

/**
 * The `[Script Info]` of an ASS script: who made it and the credits fansubs sign, then how players
 * draw it (resolution, wrapping, border scaling, colour matrix). Fields the editor doesn't know
 * stay in the file and can be changed or removed here too.
 */
export function ScriptHeaderSection() {
	const doc = useSubtitleDoc();
	const apply = useSubtitleEditor((state) => state.apply);
	const header = doc.ass;
	const entries = useMemo(() => (header ? readScriptInfo(header.head) : []), [header]);
	const generatorId = useId();
	const wrapId = useId();
	const matrixId = useId();
	const widthId = useId();
	const heightId = useId();
	if (!header) return null;
	const generator = header.generator ?? defaultGenerator();

	const value = (key: string) => entries.find((entry) => same(entry.key, key))?.value ?? '';
	const has = (key: string) => entries.some((entry) => same(entry.key, key));
	const save = (next: readonly ScriptEntry[], maker = generator) => {
		apply((present) => (present.ass ? { ...present, ass: withScriptInfo(present.ass, next, maker) } : present));
	};
	const set = (key: string, text: string) => {
		const trimmed = text.trim();
		if (!has(key)) {
			if (trimmed) save([...entries, { key, value: trimmed }]);
			return;
		}
		save(entries.map((entry) => (same(entry.key, key) ? { key: entry.key, value: trimmed } : entry)));
	};
	const remove = (key: string) => {
		save(entries.filter((entry) => !same(entry.key, key)));
	};

	const known = [...CREDITS, ...MORE_CREDITS, ...RENDERING, ...FIXED];
	const addedCredits = MORE_CREDITS.filter(has);
	const others = entries.filter((entry) => !known.some((key) => same(key, entry.key)));
	const addable = MORE_CREDITS.filter((key) => !has(key));
	const wrap = value('WrapStyle') || '0';
	const matrix = value('YCbCr Matrix') || 'None';
	const matrices = MATRICES.some((option) => same(option, matrix)) ? MATRICES : [...MATRICES, matrix];

	return (
		<Group title={m.subs_head()} defaultOpen={false}>
			<div className="grid gap-3">
				<div className="grid gap-1.5">
					<label htmlFor={generatorId} className="text-ui text-ink-2">
						{m.subs_head_generator()}
					</label>
					<input
						id={generatorId}
						type="text"
						key={generator}
						defaultValue={generator}
						onBlur={(event) => {
							const next = event.target.value.trim() || defaultGenerator();
							if (next !== generator) save(entries, next);
							else event.target.value = generator;
						}}
						onKeyDown={(event) => {
							if (event.key === 'Enter') event.currentTarget.blur();
						}}
						className="border-line-2 bg-bg text-ui text-ink hover:border-muted h-8 w-full min-w-0 cursor-text rounded-xs border px-2.5 transition-colors"
					/>
				</div>
				{CREDITS.map((key) => (
					<CommitText
						key={key}
						label={CREDIT_LABELS[key]?.() ?? key}
						value={value(key)}
						onCommit={(text) => {
							set(key, text);
						}}
					/>
				))}
				{addedCredits.map((key) => (
					<CommitText
						key={key}
						label={CREDIT_LABELS[key]?.() ?? key}
						value={value(key)}
						onCommit={(text) => {
							set(key, text);
						}}
						onRemove={() => {
							remove(key);
						}}
					/>
				))}
				{others.map((entry) => (
					<CommitText
						key={entry.key}
						label={entry.key}
						value={entry.value}
						onCommit={(text) => {
							set(entry.key, text);
						}}
						onRemove={() => {
							remove(entry.key);
						}}
					/>
				))}
				{addable.length > 0 && (
					<Menu
						label={m.subs_head_add()}
						value={null}
						items={addable.map((key) => ({ value: key, label: CREDIT_LABELS[key]?.() ?? key }))}
						onChange={(key) => {
							save([...entries, { key, value: '' }]);
						}}
						buttonClassName="text-ui text-muted -ml-2 justify-self-start px-2 font-medium"
					>
						<span className="flex items-center gap-2">
							<Plus size={16} aria-hidden="true" />
							{m.subs_head_add()}
						</span>
					</Menu>
				)}
			</div>
			<div className="border-line mt-4 grid gap-3 border-t pt-4">
				<FieldRow label={m.subs_head_width()} htmlFor={widthId}>
					<NumberField
						id={widthId}
						value={Number(value('PlayResX')) || 0}
						unit="px"
						min={1}
						max={16384}
						onCommit={(width) => {
							set('PlayResX', String(width));
						}}
					/>
				</FieldRow>
				<FieldRow label={m.subs_head_height()} htmlFor={heightId}>
					<NumberField
						id={heightId}
						value={Number(value('PlayResY')) || 0}
						unit="px"
						min={1}
						max={16384}
						onCommit={(height) => {
							set('PlayResY', String(height));
						}}
					/>
				</FieldRow>
				<FieldRow label={m.subs_head_wrap()} htmlFor={wrapId}>
					<Select
						id={wrapId}
						value={wrap}
						options={[
							{ value: '0', label: m.subs_head_wrap_smart() },
							{ value: '1', label: m.subs_head_wrap_end() },
							{ value: '2', label: m.subs_head_wrap_none() },
							{ value: '3', label: m.subs_head_wrap_smart_low() },
						]}
						onChange={(next) => {
							set('WrapStyle', next);
						}}
					/>
				</FieldRow>
				<FieldRow label={m.subs_head_matrix()} htmlFor={matrixId}>
					<Select
						id={matrixId}
						value={matrix}
						options={matrices.map((option) => ({
							value: option,
							label: option === 'None' ? m.subs_head_matrix_none() : option,
						}))}
						onChange={(next) => {
							set('YCbCr Matrix', next);
						}}
					/>
				</FieldRow>
				<Switch
					label={m.subs_head_scaled_border()}
					checked={same(value('ScaledBorderAndShadow'), 'yes')}
					onChange={(checked) => {
						set('ScaledBorderAndShadow', checked ? 'yes' : 'no');
					}}
				/>
			</div>
		</Group>
	);
}
