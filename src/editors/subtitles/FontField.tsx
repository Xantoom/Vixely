import { Monitor, Plus } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { m } from '@/paraglide/messages.js';
import { Dropdown, type DropdownOption } from '@/ui/Dropdown';
import { BUNDLED_FONTS } from './font-catalog';
import { previewFont } from './font-preview';
import {
	FONT_EXTENSIONS,
	type FontChoice,
	fileFamilies,
	fontOrigin,
	useAddedFonts,
	useSystemFonts,
} from './font-sources';
import { useSubtitleProject } from './project';

/** Names subtitles are often written with, drawn with a free equivalent when the computer's can't be had. */
const COMMON_FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Calibri', 'Comic Sans MS', 'Impact'];

/**
 * The font of a style, picked among those the subtitles can be drawn with: the video's, those
 * added, the computer's once allowed, Vixely's, and common names Vixely has an equivalent for.
 * Each name is written in its font. A font that can't be had says what draws it instead.
 */
export function FontField({
	value,
	used,
	onChange,
	beside,
}: {
	value: string;
	/** Fonts of the other styles, listed too. */
	used: readonly string[];
	onChange: (family: string) => void;
	/** A field on the same row, such as the size. */
	beside?: ReactNode;
}) {
	const videoFonts = useSubtitleProject((state) => state.fonts);
	const added = useAddedFonts((state) => state.files);
	const addFonts = useAddedFonts((state) => state.add);
	const system = useSystemFonts();
	const inputRef = useRef<HTMLInputElement>(null);

	const options: DropdownOption<string>[] = [];
	const listed = new Set<string>();
	const push = (family: string, group: string, choice: FontChoice = fontOrigin(family, videoFonts)) => {
		const key = family.trim().toLowerCase();
		if (!family.trim() || listed.has(key)) return;
		listed.add(key);
		const font = previewFont(choice, videoFonts);
		options.push({
			value: family,
			label: family,
			group,
			detail: choice.origin === 'equivalent' ? choice.shownAs : undefined,
			labelStyle: font ? { fontFamily: `${font}, var(--font-sans, sans-serif)` } : undefined,
		});
	};
	const sorted = (names: Iterable<string>) => [...new Set(names)].sort((a, b) => a.localeCompare(b));
	for (const family of sorted(videoFonts.flatMap(fileFamilies))) push(family, m.fonts_group_video());
	for (const family of sorted(added.flatMap((font) => font.families))) push(family, m.fonts_group_added());
	for (const family of BUNDLED_FONTS) push(family.family, m.fonts_group_vixely());
	for (const family of COMMON_FONTS) {
		const choice = fontOrigin(family, videoFonts);
		push(family, choice.origin === 'system' ? m.fonts_group_system() : m.fonts_group_common(), choice);
	}
	for (const family of sorted([...system.families.values()].map((entry) => entry.family)))
		push(family, m.fonts_group_system());
	// The styles' other fonts: drawn with an equivalent, or by the fallback.
	for (const family of [value, ...used]) {
		const choice = fontOrigin(family, videoFonts);
		push(family, choice.origin === 'equivalent' ? m.fonts_group_common() : m.fonts_group_missing(), choice);
	}
	// Groups follow each other: an option keeps its group's place.
	const order: string[] = [
		m.fonts_group_video(),
		m.fonts_group_added(),
		m.fonts_group_common(),
		m.fonts_group_vixely(),
		m.fonts_group_system(),
		m.fonts_group_missing(),
	];
	options.sort((a, b) => order.indexOf(a.group ?? '') - order.indexOf(b.group ?? ''));

	const current = fontOrigin(value, videoFonts);
	const replaced = current.origin === 'equivalent' || current.origin === 'missing';

	return (
		<div className="grid gap-1.5">
			<div className="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-2">
				<div className="grid gap-1.5">
					<span className="text-ui text-ink-2" aria-hidden="true">
						{m.style_font()}
					</span>
					<Dropdown label={m.style_font()} value={value} options={options} onChange={onChange} />
				</div>
				{beside}
			</div>
			{replaced && (
				<p className="text-small text-muted" role="status">
					{current.origin === 'equivalent'
						? m.fonts_replaced({ font: current.shownAs ?? '' })
						: m.fonts_missing({ font: value })}
				</p>
			)}
			<div className="flex flex-wrap gap-x-4 gap-y-1">
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					className="text-small text-ink-2 hover:text-ink flex items-center gap-1 font-medium"
				>
					<Plus size={14} aria-hidden="true" />
					{m.fonts_add()}
				</button>
				{(system.state === 'unknown' || system.state === 'denied') && (
					<button
						type="button"
						disabled={system.state === 'denied'}
						title={system.state === 'denied' ? m.fonts_system_denied() : undefined}
						onClick={() => void system.request()}
						className="text-small text-ink-2 enabled:hover:text-ink flex items-center gap-1 font-medium disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Monitor size={14} aria-hidden="true" />
						{m.fonts_system()}
					</button>
				)}
			</div>
			<input
				ref={inputRef}
				type="file"
				accept={FONT_EXTENSIONS.join(',')}
				multiple
				className="hidden"
				tabIndex={-1}
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					event.target.value = '';
					void addFonts(files).then((fonts) => {
						// A single font added becomes the style's.
						const family = fonts.length === 1 ? fonts[0]?.families[0] : undefined;
						if (family) onChange(family);
					});
				}}
			/>
		</div>
	);
}
