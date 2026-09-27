import { Bold, Copy, Italic, Strikethrough, Trash2, Underline } from 'lucide-react';
import { useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { usePlayback } from '@/media/playback';
import { m } from '@/paraglide/messages.js';
import { Button, IconButton } from '@/ui/Button';
import { ColorPopover } from '@/ui/ColorPopover';
import { NumberField, Select, Slider } from '@/ui/fields';
import { useSubtitleDoc, useSubtitleEditor } from './store';
import {
	assColor,
	assFlag,
	type AssStyle,
	deleteStyle,
	duplicateStyle,
	readStyles,
	styleUse,
	toAssColor,
	toAssDoc,
	updateStyle,
} from './styles';

/** Fonts every system has, or nearly: what styles are usually written with. */
const COMMON_FONTS = [
	'Arial',
	'Arial Black',
	'Verdana',
	'Tahoma',
	'Trebuchet MS',
	'Georgia',
	'Times New Roman',
	'Courier New',
	'Impact',
	'Comic Sans MS',
];

/** Positions on the picture, as the numeric keypad lays them out: 7 8 9 on top, 1 2 3 below. */
const POSITIONS = [7, 8, 9, 4, 5, 6, 1, 2, 3] as const;

const POSITION_LABELS: Record<(typeof POSITIONS)[number], () => string> = {
	7: () => m.align_7(),
	8: () => m.align_8(),
	9: () => m.align_9(),
	4: () => m.align_4(),
	5: () => m.align_5(),
	6: () => m.align_6(),
	1: () => m.align_1(),
	2: () => m.align_2(),
	3: () => m.align_3(),
};

function ColorChoice({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string | undefined;
	onChange: (value: string) => void;
}) {
	const { hex, opacity } = assColor(value);
	return (
		<div className="grid justify-items-center gap-1.5">
			<ColorPopover
				label={label}
				value={hex}
				onChange={(color) => {
					// The colour changes; how see-through it is stays.
					onChange(toAssColor(color, opacity));
				}}
				className="size-9 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)] transition-transform duration-200 hover:scale-105"
			>
				<span
					className="block size-full rounded-full"
					style={{ background: hex, opacity: Math.max(0.25, opacity) }}
				/>
			</ColorPopover>
			<span className="text-caption text-ink-2">{label}</span>
		</div>
	);
}

/**
 * The styles of an ASS file, as Aegisub's style manager: pick one, then its font, size, colours,
 * outline, position and margins. The preview follows every change. SRT and WebVTT become ASS
 * first, at a click.
 */
export function StylesPanel({ title }: { title: string }) {
	const doc = useSubtitleDoc();
	const apply = useSubtitleEditor((state) => state.apply);
	const preview = useSubtitleEditor((state) => state.preview);
	const settle = useSubtitleEditor((state) => state.settle);
	const setExport = useSubtitleEditor((state) => state.setExport);
	const video = usePlayback((state) => state.details?.video ?? null);
	const [chosen, setChosen] = useState(0);

	if (!doc.ass) {
		return (
			<>
				<PanelTitle>{m.tool_styles()}</PanelTitle>
				<Button
					onClick={() => {
						apply((before) =>
							toAssDoc(before, title, video ? { width: video.width, height: video.height } : undefined),
						);
						setExport({ format: 'ass' });
					}}
				>
					{m.styles_use()}
				</Button>
			</>
		);
	}

	const styles = readStyles(doc.ass.head).styles;
	const index = Math.min(chosen, styles.length - 1);
	const style: AssStyle | undefined = styles[index];
	const use = styleUse(doc);
	const set = (change: Record<string, string>) => {
		apply((before) => updateStyle(before, index, change));
	};
	const fonts = [...new Set([...COMMON_FONTS, ...styles.map((item) => item.fontname ?? '')])].filter(Boolean);
	const flag = (field: string) => assFlag(style?.[field]);
	const toggle = (field: string) => {
		set({ [field]: flag(field) ? '0' : '-1' });
	};

	return (
		<>
			<PanelTitle>{m.tool_styles()}</PanelTitle>
			<div role="radiogroup" aria-label={m.tool_styles()} className="-mx-2.5 grid gap-0.5">
				{styles.map((item, at) => (
					<button
						key={`${item.name}-${at}`}
						type="button"
						role="radio"
						aria-checked={at === index}
						onClick={() => {
							setChosen(at);
						}}
						className="hover:bg-surface aria-checked:bg-ed-soft group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xs px-2.5 py-2 text-left"
					>
						<span className="text-body truncate" style={{ fontFamily: item.fontname }}>
							{item.name}
						</span>
						<span className="text-small text-muted tabular font-mono">
							{m.style_lines({ count: String(use.get(item.name ?? '') ?? 0) })}
						</span>
					</button>
				))}
			</div>
			<div className="flex gap-1">
				<IconButton
					label={m.style_duplicate()}
					onClick={() => {
						apply((before) => duplicateStyle(before, index));
						setChosen(index + 1);
					}}
				>
					<Copy size={17} />
				</IconButton>
				<IconButton
					label={m.style_delete()}
					disabled={styles.length <= 1}
					onClick={() => {
						apply((before) => deleteStyle(before, index));
						setChosen(Math.max(0, index - 1));
					}}
				>
					<Trash2 size={17} />
				</IconButton>
			</div>

			{style && (
				<>
					<Section title={m.style_text_color()}>
						<label className="grid gap-1.5">
							<span className="text-ui text-ink-2">{m.style_name()}</span>
							<input
								type="text"
								value={style.name ?? ''}
								onChange={(event) => {
									// Commas would break the line the style is written on.
									const name = event.target.value.replaceAll(',', ' ');
									preview((before) => updateStyle(before, index, { name }));
								}}
								onBlur={settle}
								className="border-line-2 bg-bg text-ui text-ink hover:border-muted h-8 w-full rounded-xs border px-2.5 transition-colors"
							/>
						</label>
						<div className="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-2">
							<div className="grid gap-1.5">
								<span className="text-ui text-ink-2" aria-hidden="true">
									{m.style_font()}
								</span>
								<Select
									label={m.style_font()}
									value={style.fontname ?? 'Arial'}
									options={fonts.map((font) => ({ value: font, label: font }))}
									onChange={(fontname) => {
										set({ fontname });
									}}
								/>
							</div>
							<label className="grid gap-1.5">
								<span className="text-ui text-ink-2">{m.style_size()}</span>
								<NumberField
									value={Math.round(Number(style.fontsize) || 0)}
									min={1}
									max={999}
									onCommit={(size) => {
										set({ fontsize: String(size) });
									}}
								/>
							</label>
						</div>
						<div className="flex gap-0.5">
							{(
								[
									['bold', m.subs_bold(), Bold],
									['italic', m.subs_italic(), Italic],
									['underline', m.subs_underline(), Underline],
									['strikeout', m.subs_strike(), Strikethrough],
								] as const
							).map(([field, label, Icon]) => (
								<IconButton
									key={field}
									label={label}
									aria-pressed={flag(field)}
									onClick={() => {
										toggle(field);
									}}
								>
									<Icon size={16} />
								</IconButton>
							))}
						</div>
					</Section>

					<Section title={m.style_colors()}>
						<div className="grid grid-cols-3">
							<ColorChoice
								label={m.style_text_color()}
								value={style.primarycolour}
								onChange={(primarycolour) => {
									set({ primarycolour });
								}}
							/>
							<ColorChoice
								label={m.style_outline_color()}
								value={style.outlinecolour}
								onChange={(outlinecolour) => {
									set({ outlinecolour });
								}}
							/>
							<ColorChoice
								label={m.style_shadow_color()}
								value={style.backcolour}
								onChange={(backcolour) => {
									set({ backcolour });
								}}
							/>
						</div>
						<Slider
							label={m.style_outline()}
							value={Math.round((Number(style.outline) || 0) * 2)}
							min={0}
							max={40}
							format={(halves) => String(halves / 2)}
							onChange={(halves) => {
								preview((before) => updateStyle(before, index, { outline: String(halves / 2) }));
							}}
							onEnd={settle}
						/>
						<Slider
							label={m.style_shadow()}
							value={Math.round((Number(style.shadow) || 0) * 2)}
							min={0}
							max={40}
							format={(halves) => String(halves / 2)}
							onChange={(halves) => {
								preview((before) => updateStyle(before, index, { shadow: String(halves / 2) }));
							}}
							onEnd={settle}
						/>
					</Section>

					<Section title={m.style_position()}>
						<div role="radiogroup" aria-label={m.style_position()} className="grid w-32 grid-cols-3 gap-1">
							{POSITIONS.map((position) => (
								<button
									key={position}
									type="button"
									role="radio"
									aria-checked={style.alignment === String(position)}
									aria-label={POSITION_LABELS[position]()}
									data-tip={POSITION_LABELS[position]()}
									onClick={() => {
										set({ alignment: String(position) });
									}}
									className="bg-surface hover:bg-surface-2 aria-checked:bg-ed grid h-8 place-items-center rounded-xs transition-colors"
								>
									<span className="bg-ink-2 size-1.5 rounded-full" aria-hidden="true" />
								</button>
							))}
						</div>
					</Section>

					<Section title={m.style_margins()}>
						<div className="grid grid-cols-3 gap-2">
							{(
								[
									['marginl', m.style_margin_left()],
									['marginr', m.style_margin_right()],
									['marginv', m.style_margin_vertical()],
								] as const
							).map(([field, label]) => (
								<label key={field} className="grid gap-1.5">
									<span className="text-ui text-ink-2">{label}</span>
									<NumberField
										value={Math.round(Number(style[field]) || 0)}
										unit="px"
										min={0}
										max={9999}
										onCommit={(value) => {
											set({ [field]: String(value) });
										}}
									/>
								</label>
							))}
						</div>
					</Section>
				</>
			)}
		</>
	);
}
