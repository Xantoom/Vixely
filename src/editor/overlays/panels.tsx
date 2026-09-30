import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowDownToLine,
	ArrowUpToLine,
	Bold,
	Brush,
	ChevronLeft,
	ChevronRight,
	Copy,
	Droplets,
	Grid3x3,
	Italic,
	ScanFace,
	Plus,
	Shapes,
	Smile,
	Trash2,
	Type,
} from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useId, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { formatClock } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { Button } from '@/ui/Button';
import { ColorPopover } from '@/ui/ColorPopover';
import { FieldRow, Select, Slider, Switch, TimeField } from '@/ui/fields';
import {
	type OverlayEditing,
	type OverlayTiming,
	placeOverlay,
	updateShape,
	updateText,
	updateZone,
	useBrush,
	useOverlaySelection,
} from './editing';
import {
	createShape,
	createSticker,
	createText,
	createZone,
	duplicate,
	FONTS,
	fontInfo,
	type FontId,
	type Overlay,
	type ShapeId,
	SHAPES,
	SWATCHES,
	TEXT_STYLE_IDS,
	TEXT_STYLES,
	type TextOverlay,
	type TextStyleId,
	type ZoneEffect,
	type ZoneOverlay,
} from './model';
import { STICKER_GROUPS } from './sticker-list';

const STICKER_GROUP_IDS: (keyof typeof STICKER_GROUPS)[] = [
	'faces',
	'hands',
	'hearts',
	'symbols',
	'nature',
	'food',
	'activities',
];

/** A button that stays pressed: bold, italic, alignment. */
function Toggle({
	label,
	pressed,
	onClick,
	children,
}: {
	label: string;
	pressed: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<IconButton
			label={label}
			aria-pressed={pressed}
			onClick={onClick}
			className="aria-pressed:bg-ed-soft aria-pressed:text-ed-text"
		>
			{children}
		</IconButton>
	);
}

/** A few colours in one click, and the chooser for any other. */
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
	const current = value.slice(0, 7).toLowerCase();
	return (
		<div className="grid gap-2">
			<span className="text-ui text-ink-2">{label}</span>
			<div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
				{SWATCHES.map((swatch) => (
					<button
						key={swatch}
						type="button"
						role="radio"
						aria-checked={current === swatch}
						aria-label={swatch}
						title={swatch}
						onClick={() => {
							onChange(swatch);
						}}
						style={{ background: swatch }}
						className="ease-spring size-7 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] transition-transform duration-200 hover:scale-110 aria-checked:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--ed)]"
					/>
				))}
				<ColorPopover
					label={m.color_other()}
					value={current}
					onChange={onChange}
					className={`ease-spring size-7 rounded-full bg-[conic-gradient(#ff3b30,#ffe14d,#34c759,#00c7be,#0a84ff,#bf5af2,#ff3b30)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] transition-transform duration-200 hover:scale-110 aria-expanded:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--ed)] ${SWATCHES.includes(current) ? '' : 'shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--ed)]'}`}
				>
					{!SWATCHES.includes(current) && (
						<span
							className="m-auto block size-3.5 rounded-full shadow-[0_0_0_2px_#fff]"
							style={{ background: current }}
							aria-hidden="true"
						/>
					)}
				</ColorPopover>
			</div>
		</div>
	);
}

/** Size, angle, opacity and order of the selected overlay, and removing or copying it. */
/** Length an overlay first shows for when limited to a part of the video, from the playhead. */
const FIRST_SPAN = 3;

/** When the overlay shows over a video: all along, or between two times. */
function Timing({ editing, overlay, timing }: { editing: OverlayEditing; overlay: Overlay; timing: OverlayTiming }) {
	const ids = { start: useId(), end: useId() };
	const { duration, playhead } = timing;
	const span = overlay.span ?? null;
	const setSpan = (next: { start: number; end: number } | null) => {
		editing.apply(placeOverlay(overlay.id, { span: next }));
	};
	return (
		<Section title={m.overlay_timing()}>
			<Switch
				label={m.overlay_whole_video()}
				checked={span === null}
				onChange={(whole) => {
					if (whole) setSpan(null);
					else {
						const start = Math.min(playhead(), Math.max(0, duration - FIRST_SPAN));
						setSpan({ start, end: Math.min(duration, start + FIRST_SPAN) });
					}
				}}
			/>
			{span && (
				<div className="grid gap-2.5">
					<FieldRow label={m.overlay_from()} htmlFor={ids.start}>
						<TimeField
							id={ids.start}
							value={span.start}
							min={0}
							max={span.end}
							onCommit={(start) => {
								setSpan({ ...span, start });
							}}
						/>
					</FieldRow>
					<FieldRow label={m.overlay_to()} htmlFor={ids.end}>
						<TimeField
							id={ids.end}
							value={span.end}
							min={span.start}
							max={duration}
							onCommit={(end) => {
								setSpan({ ...span, end });
							}}
						/>
					</FieldRow>
					<div className="grid grid-cols-2 gap-2">
						<Button
							onClick={() => {
								// Past the end, the end moves along.
								const start = playhead();
								setSpan({
									start,
									end: start < span.end ? span.end : Math.min(duration, start + FIRST_SPAN),
								});
							}}
						>
							{m.overlay_from_here()}
						</Button>
						<Button
							onClick={() => {
								// Before the start, the start moves along.
								const end = playhead();
								setSpan({ start: end > span.start ? span.start : Math.max(0, end - FIRST_SPAN), end });
							}}
						>
							{m.overlay_to_here()}
						</Button>
					</div>
				</div>
			)}
		</Section>
	);
}

function Arrange({ editing, overlay }: { editing: OverlayEditing; overlay: Overlay }) {
	const select = useOverlaySelection((state) => state.select);
	const index = editing.overlays.findIndex((candidate) => candidate.id === overlay.id);
	const place = (change: Parameters<typeof placeOverlay>[1]) => {
		editing.preview(placeOverlay(overlay.id, change));
	};
	const move = (to: number) => {
		editing.apply((list) => {
			const next = list.filter((candidate) => candidate.id !== overlay.id);
			next.splice(to, 0, overlay);
			return next;
		});
	};
	return (
		<>
			<Section title={m.overlay_arrange()}>
				<Slider
					label={m.overlay_size()}
					value={Math.round(overlay.size * 100)}
					min={1}
					max={150}
					defaultValue={Math.round(overlay.size * 100)}
					format={(value) => `${value} %`}
					onChange={(value) => {
						place({ size: value / 100 });
					}}
					onEnd={editing.settle}
				/>
				{overlay.kind !== 'zone' && (
					<Slider
						label={m.overlay_rotation()}
						value={Math.round(overlay.rotation)}
						min={-180}
						max={180}
						format={(value) => `${value}°`}
						onChange={(rotation) => {
							place({ rotation });
						}}
						onEnd={editing.settle}
					/>
				)}
				{overlay.kind !== 'zone' && (
					<Slider
						label={m.overlay_opacity()}
						value={Math.round(overlay.opacity * 100)}
						min={0}
						max={100}
						defaultValue={100}
						format={(value) => `${value} %`}
						onChange={(value) => {
							place({ opacity: value / 100 });
						}}
						onEnd={editing.settle}
					/>
				)}
				<div className="flex gap-1">
					<IconButton
						label={m.overlay_front()}
						disabled={index === editing.overlays.length - 1}
						onClick={() => {
							move(editing.overlays.length - 1);
						}}
					>
						<ArrowUpToLine className="size-5" />
					</IconButton>
					<IconButton
						label={m.overlay_back()}
						disabled={index === 0}
						onClick={() => {
							move(0);
						}}
					>
						<ArrowDownToLine className="size-5" />
					</IconButton>
					<IconButton
						label={m.overlay_duplicate()}
						onClick={() => {
							const copy = duplicate(overlay);
							editing.apply((list) => [...list, copy]);
							select(copy.id);
						}}
					>
						<Copy className="size-5" />
					</IconButton>
					<IconButton
						label={m.overlay_delete()}
						onClick={() => {
							editing.apply((list) => list.filter((candidate) => candidate.id !== overlay.id));
							select(null);
						}}
						className="ml-auto"
					>
						<Trash2 className="size-5" />
					</IconButton>
				</div>
			</Section>
			{editing.timing && <Timing editing={editing} overlay={overlay} timing={editing.timing} />}
		</>
	);
}

const STYLE_LABELS: Record<TextStyleId, () => string> = {
	title: () => m.text_style_title(),
	body: () => m.text_style_body(),
	meme: () => m.text_style_meme(),
	caption: () => m.text_style_caption(),
	handwritten: () => m.text_style_handwritten(),
};

/** Where each style starts: memes at the top, captions near the bottom. */
const STYLE_Y: Record<TextStyleId, number> = { title: 0.5, body: 0.5, meme: 0.1, caption: 0.85, handwritten: 0.5 };

/** The words and look of a text layer. */
function TextSettings({
	editing,
	text,
	textRef,
}: {
	editing: OverlayEditing;
	text: TextOverlay;
	textRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const change = (next: Parameters<typeof updateText>[1]) => {
		editing.apply(updateText(text.id, next));
	};
	return (
		<>
			<Section title={m.text_content()}>
				<textarea
					ref={textRef}
					aria-label={m.text_content()}
					value={text.text}
					rows={Math.min(5, text.text.split('\n').length + 1)}
					onChange={(event) => {
						editing.preview(updateText(text.id, { text: event.target.value }));
					}}
					onBlur={editing.settle}
					className="bg-surface text-body focus:shadow-[inset_0_0_0_1.5px_var(--ed)] w-full resize-none rounded-sm px-3.5 py-2.5 outline-none"
				/>
			</Section>
			<Section title={m.text_style()}>
				<FieldRow label={m.text_font()} htmlFor="text-font">
					<Select
						id="text-font"
						value={text.font}
						options={FONTS.map((font) => ({ value: font.id, label: font.label }))}
						onChange={(font: FontId) => {
							change({ font });
						}}
					/>
				</FieldRow>
				<div className="flex gap-1">
					<Toggle
						label={m.text_bold()}
						pressed={text.bold}
						onClick={() => {
							change({ bold: !text.bold });
						}}
					>
						<Bold className="size-5" />
					</Toggle>
					<Toggle
						label={m.text_italic()}
						pressed={text.italic}
						onClick={() => {
							change({ italic: !text.italic });
						}}
					>
						<Italic className="size-5" />
					</Toggle>
					<span className="bg-line mx-1 w-px self-stretch" aria-hidden="true" />
					{(
						[
							['left', AlignLeft, m.text_align_left()],
							['center', AlignCenter, m.text_align_center()],
							['right', AlignRight, m.text_align_right()],
						] as const
					).map(([align, Icon, label]) => (
						<Toggle
							key={align}
							label={label}
							pressed={text.align === align}
							onClick={() => {
								change({ align });
							}}
						>
							<Icon className="size-5" />
						</Toggle>
					))}
				</div>
				<ColorPicker
					label={m.text_color()}
					value={text.color}
					onChange={(color) => {
						change({ color });
					}}
				/>
				<Slider
					label={m.text_outline()}
					value={Math.round(text.outline * 100)}
					min={0}
					max={30}
					format={String}
					onChange={(value) => {
						editing.preview(updateText(text.id, { outline: value / 100 }));
					}}
					onEnd={editing.settle}
				/>
				{text.outline > 0 && (
					<ColorPicker
						label={m.text_outline_color()}
						value={text.outlineColor}
						onChange={(outlineColor) => {
							change({ outlineColor });
						}}
					/>
				)}
				<div className="flex flex-wrap gap-2">
					{(
						[
							[
								m.text_box(),
								text.background !== null,
								{ background: text.background ? null : '#000000b3' },
							],
							[m.text_shadow(), text.shadow, { shadow: !text.shadow }],
						] as const
					).map(([label, pressed, next]) => (
						<button
							key={label}
							type="button"
							aria-pressed={pressed}
							onClick={() => {
								change(next);
							}}
							className="text-ui aria-pressed:bg-ed-soft aria-pressed:text-ed-text aria-pressed:shadow-[inset_0_0_0_1.5px_var(--ed)] rounded-full px-3.5 py-1.5 font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-colors"
						>
							{label}
						</button>
					))}
				</div>
				{text.background && (
					<ColorPicker
						label={m.text_box_color()}
						value={text.background}
						onChange={(color) => {
							// The box stays a little see-through, as captions are.
							change({ background: `${color}b3` });
						}}
					/>
				)}
			</Section>
		</>
	);
}

/** Starting looks for text, each written in its font. */
function TextStyles({ onAdd }: { onAdd: (style: TextStyleId) => void }) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{TEXT_STYLE_IDS.map((style) => {
				const look = TEXT_STYLES[style];
				const font = fontInfo(look.font);
				return (
					<button
						key={style}
						type="button"
						onClick={() => {
							onAdd(style);
						}}
						className="bg-surface hover:bg-surface-2 ease-spring grid h-16 place-items-center rounded-sm px-2 transition-[background-color,transform] duration-200 active:scale-[0.97]"
					>
						<span
							className="truncate text-[1.2rem] leading-none"
							style={{ fontFamily: `"${font.family}"`, fontWeight: look.bold && font.bold ? 700 : 400 }}
						>
							{STYLE_LABELS[style]()}
						</span>
					</button>
				);
			})}
		</div>
	);
}

const SHAPE_LABELS: Record<ShapeId, () => string> = {
	arrow: () => m.shape_arrow(),
	circle: () => m.shape_circle(),
	square: () => m.shape_square(),
	star: () => m.shape_star(),
	heart: () => m.shape_heart(),
	bubble: () => m.shape_bubble(),
};

const SHAPE_ICONS: Record<ShapeId, string> = {
	arrow: 'M2 9h13V5l7 7-7 7v-4H2z',
	circle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
	square: 'M3 3h18v18H3zm3 3v12h12V6z',
	star: 'M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z',
	heart: 'M12 21C3 14 2 9 5 6s6-1 7 1c1-2 4-4 7-1s2 8-7 15z',
	bubble: 'M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
};

const GROUP_LABELS: Record<keyof typeof STICKER_GROUPS, () => string> = {
	faces: () => m.stickers_faces(),
	hands: () => m.stickers_hands(),
	hearts: () => m.stickers_hearts(),
	symbols: () => m.stickers_symbols(),
	nature: () => m.stickers_nature(),
	food: () => m.stickers_food(),
	activities: () => m.stickers_activities(),
};

function ShapePicker({ color, onAdd }: { color: string; onAdd: (overlay: Overlay) => void }) {
	return (
		<div className="grid grid-cols-6 gap-1.5">
			{SHAPES.map((id) => (
				<button
					key={id}
					type="button"
					aria-label={SHAPE_LABELS[id]()}
					title={SHAPE_LABELS[id]()}
					onClick={() => {
						onAdd(createShape(id, color));
					}}
					className="bg-surface hover:bg-surface-2 text-ink-2 ease-spring grid aspect-square place-items-center rounded-sm transition-transform duration-200 active:scale-95"
				>
					<svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
						<path d={SHAPE_ICONS[id]} fill="currentColor" fillRule="evenodd" />
					</svg>
				</button>
			))}
		</div>
	);
}

function StickerPicker({ onAdd }: { onAdd: (overlay: Overlay) => void }) {
	return (
		<>
			{STICKER_GROUP_IDS.map((group) => (
				<Section key={group} title={GROUP_LABELS[group]()}>
					<div className="grid grid-cols-6 gap-1">
						{STICKER_GROUPS[group].map((emoji) => (
							<button
								key={emoji}
								type="button"
								aria-label={emojiText(emoji)}
								onClick={() => {
									onAdd(createSticker(emoji));
								}}
								className="hover:bg-surface ease-spring grid aspect-square place-items-center rounded-sm transition-transform duration-200 hover:scale-110 active:scale-95"
							>
								<img src={`/stickers/${emoji}.svg`} alt="" className="size-8" draggable={false} />
							</button>
						))}
					</div>
				</Section>
			))}
			<p className="text-caption text-muted">{m.stickers_credit()}</p>
		</>
	);
}

function emojiText(emoji: string): string {
	return String.fromCodePoint(...emoji.split('-').map((code) => Number.parseInt(code, 16)));
}

/** A layer's picture in the list: its text in its font, its emoji or its shape. */
function LayerThumb({ overlay }: { overlay: Overlay }) {
	if (overlay.kind === 'sticker') {
		return <img src={`/stickers/${overlay.emoji}.svg`} alt="" className="size-6" draggable={false} />;
	}
	if (overlay.kind === 'shape') {
		return (
			<svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
				<path d={SHAPE_ICONS[overlay.shape]} fill={overlay.color} fillRule="evenodd" />
			</svg>
		);
	}
	if (overlay.kind === 'zone') {
		const Icon = overlay.effect === 'blur' ? Droplets : Grid3x3;
		return <Icon className="text-ink-2 size-4.5" aria-hidden="true" />;
	}
	if (overlay.kind === 'drawing') {
		return <Brush className="size-4.5" style={{ color: overlay.strokes[0]?.color }} aria-hidden="true" />;
	}
	return <Type className="text-ink-2 size-4.5" aria-hidden="true" />;
}

function layerName(overlay: Overlay): string {
	if (overlay.kind === 'text') return overlay.text.split('\n')[0] || m.tool_text();
	if (overlay.kind === 'shape') return SHAPE_LABELS[overlay.shape]();
	if (overlay.kind === 'zone') return overlay.effect === 'blur' ? m.layers_zone_blur() : m.layers_zone_pixelate();
	if (overlay.kind === 'drawing') return m.layers_drawing();
	return m.layers_add_sticker();
}

const ZONE_EFFECTS: { id: ZoneEffect; label: () => string; icon: typeof Droplets }[] = [
	{ id: 'blur', label: () => m.zone_blur(), icon: Droplets },
	{ id: 'pixelate', label: () => m.zone_pixelate(), icon: Grid3x3 },
];

/** The two ways to hide a part of the picture, as tiles. */
function ZoneEffects({
	value,
	onChoose,
	label,
}: {
	value: ZoneEffect | null;
	onChoose: (effect: ZoneEffect) => void;
	label: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5">
			{ZONE_EFFECTS.map(({ id, label: name, icon: Icon }) => (
				<button
					key={id}
					type="button"
					role="radio"
					aria-checked={value === id}
					onClick={() => {
						onChoose(id);
					}}
					className="text-ui text-ink-2 hover:bg-surface aria-checked:bg-ed-soft aria-checked:text-ink ease-spring flex h-11 items-center justify-center gap-2 rounded-sm font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.98] aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)]"
				>
					<Icon size={18} aria-hidden="true" />
					{name()}
				</button>
			))}
		</div>
	);
}

/** Effect, strength and shape of the zone selected. */
function ZoneSettings({ editing, zone }: { editing: OverlayEditing; zone: ZoneOverlay }) {
	return (
		<Section title={m.zone_effect()}>
			<ZoneEffects
				label={m.zone_effect()}
				value={zone.effect}
				onChoose={(effect) => {
					editing.apply(updateZone(zone.id, { effect }));
				}}
			/>
			<Slider
				label={m.zone_strength()}
				value={Math.round(zone.strength * 100)}
				min={0}
				max={100}
				defaultValue={50}
				format={(value) => `${value} %`}
				onChange={(value) => {
					editing.preview(updateZone(zone.id, { strength: value / 100 }));
				}}
				onEnd={editing.settle}
			/>
			<Switch
				label={m.zone_round()}
				checked={zone.round}
				onChange={(round) => {
					editing.apply(updateZone(zone.id, { round }));
				}}
			/>
		</Section>
	);
}

/** The brush's colour and size, while pressing on the picture draws. */
function BrushSettings() {
	const color = useBrush((state) => state.color);
	const width = useBrush((state) => state.width);
	const set = useBrush((state) => state.set);
	useEffect(() => {
		set({ active: true });
		return () => {
			set({ active: false });
		};
	}, [set]);
	return (
		<div className="grid gap-4">
			<ColorPicker
				label={m.brush_color()}
				value={color}
				onChange={(next) => {
					set({ color: next });
				}}
			/>
			<Slider
				label={m.brush_width()}
				value={Math.round(width * 1000)}
				min={2}
				max={80}
				defaultValue={12}
				format={String}
				onChange={(value) => {
					set({ width: value / 1000 });
				}}
				onEnd={() => undefined}
			/>
		</div>
	);
}

/**
 * Every layer, the front one first: pressing one selects it, dragging it moves it in front of or
 * behind the others.
 */
function LayerList({ editing }: { editing: OverlayEditing }) {
	const selectedId = useOverlaySelection((state) => state.selected);
	const select = useOverlaySelection((state) => state.select);
	const [dragged, setDragged] = useState<string | null>(null);
	const [over, setOver] = useState<number | null>(null);
	const front = editing.overlays.toReversed();
	const moveTo = (id: string, position: number) => {
		editing.apply((list) => {
			const moving = list.find((overlay) => overlay.id === id);
			if (!moving) return list;
			const reversed = list.toReversed().filter((overlay) => overlay.id !== id);
			reversed.splice(position, 0, moving);
			return reversed.toReversed();
		});
	};
	return (
		<ol aria-label={m.layers_list()} className="-mx-2 grid gap-0.5">
			{front.map((overlay, position) => (
				<li
					key={overlay.id}
					draggable
					onDragStart={(event) => {
						event.dataTransfer.effectAllowed = 'move';
						setDragged(overlay.id);
					}}
					onDragOver={(event) => {
						if (!dragged) return;
						event.preventDefault();
						setOver(position);
					}}
					onDrop={(event) => {
						event.preventDefault();
						if (dragged) moveTo(dragged, position);
						setDragged(null);
						setOver(null);
					}}
					onDragEnd={() => {
						setDragged(null);
						setOver(null);
					}}
					className={`relative ${dragged === overlay.id ? 'opacity-40' : ''} ${
						over === position && dragged !== overlay.id
							? "before:bg-ed before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:content-['']"
							: ''
					}`}
				>
					<div
						role="button"
						tabIndex={0}
						aria-pressed={overlay.id === selectedId}
						title={m.layers_edit()}
						onClick={() => {
							select(overlay.id);
						}}
						onKeyDown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								select(overlay.id);
							}
						}}
						className="hover:bg-surface aria-pressed:bg-ed-soft aria-pressed:shadow-[inset_0_0_0_1.5px_var(--ed)] group flex h-12 cursor-pointer items-center gap-3 rounded-sm pr-1 pl-2 transition-[background-color,box-shadow] active:cursor-grabbing"
					>
						<span className="bg-surface-2 grid size-8 flex-none place-items-center rounded-xs">
							<LayerThumb overlay={overlay} />
						</span>
						<span className="text-ui min-w-0 flex-1 truncate font-medium">{layerName(overlay)}</span>
						{editing.timing && (
							<span className="text-caption text-muted tabular flex-none">
								{overlay.span
									? `${formatClock(overlay.span.start)}–${formatClock(overlay.span.end)}`
									: m.layers_always()}
							</span>
						)}
						<IconButton
							label={m.overlay_delete()}
							onClick={(event) => {
								event.stopPropagation();
								editing.apply((list) => list.filter((candidate) => candidate.id !== overlay.id));
								if (overlay.id === selectedId) select(null);
							}}
							className="text-muted hover:text-danger"
						>
							<Trash2 className="size-4" />
						</IconButton>
						<ChevronRight className="text-muted size-4 flex-none" aria-hidden="true" />
					</div>
				</li>
			))}
		</ol>
	);
}

type AddKind = 'text' | 'sticker' | 'shape' | 'zone' | 'draw';

const ADD_LABELS: Record<AddKind, () => string> = {
	text: () => m.layers_add_text(),
	sticker: () => m.layers_add_sticker(),
	shape: () => m.layers_add_shape(),
	zone: () => m.layers_add_zone(),
	draw: () => m.layers_add_draw(),
};

const ADD_ICONS: Record<AddKind, typeof Type> = {
	text: Type,
	sticker: Smile,
	shape: Shapes,
	zone: ScanFace,
	draw: Brush,
};

/**
 * The Layers tool: text, stickers, shapes, drawings and blurred zones over the picture, as many as wanted, each in
 * front of or behind the others and, over a video, shown for a part of it. Adding one opens its
 * choices; the layer selected shows its settings.
 */
export function LayersPanel({
	editing,
	textRef,
}: {
	editing: OverlayEditing;
	/** The text field, focused by a double-click on the picture. */
	textRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const selectedId = useOverlaySelection((state) => state.selected);
	const select = useOverlaySelection((state) => state.select);
	const selected = editing.overlays.find((overlay) => overlay.id === selectedId) ?? null;
	const [adding, setAdding] = useState<AddKind | null>(editing.overlays.length === 0 ? 'text' : null);

	const add = (overlay: Overlay) => {
		editing.apply((list) => [...list, overlay]);
		select(overlay.id);
		setAdding(null);
	};
	const addText = (style: TextStyleId) => {
		add(createText(style, style === 'meme' ? m.text_placeholder_meme() : m.text_placeholder(), STYLE_Y[style]));
		requestAnimationFrame(() => {
			textRef.current?.select();
		});
	};

	// A layer chosen: its settings alone, a way back to the list above them.
	if (selected) {
		return (
			<>
				<PanelTitle
					action={
						<IconButton
							label={m.overlay_delete()}
							onClick={() => {
								editing.apply((list) => list.filter((overlay) => overlay.id !== selected.id));
								select(null);
							}}
							className="hover:text-danger"
						>
							<Trash2 className="size-4" />
						</IconButton>
					}
				>
					{layerName(selected)}
				</PanelTitle>
				<button
					type="button"
					onClick={() => {
						select(null);
						setAdding(null);
					}}
					className="text-ui text-ink-2 hover:text-ink hover:bg-surface -mx-2 -mt-2 flex h-9 items-center gap-1.5 justify-self-start rounded-sm px-2 font-medium"
				>
					<ChevronLeft className="size-4" aria-hidden="true" />
					{m.layers_all({ count: editing.overlays.length })}
				</button>
				{selected.kind === 'text' && <TextSettings editing={editing} text={selected} textRef={textRef} />}
				{selected.kind === 'shape' && (
					<Section title={m.text_style()}>
						<ColorPicker
							label={m.text_color()}
							value={selected.color}
							onChange={(color) => {
								editing.apply(updateShape(selected.id, { color }));
							}}
						/>
						<Switch
							label={m.shape_outlined()}
							checked={selected.outlined}
							onChange={(outlined) => {
								editing.apply(updateShape(selected.id, { outlined }));
							}}
						/>
					</Section>
				)}
				{selected.kind === 'zone' && <ZoneSettings editing={editing} zone={selected} />}
				{/* Still drawing: the lines drawn next join this drawing. */}
				{selected.kind === 'drawing' && adding === 'draw' && (
					<Section title={m.layers_add_draw()}>
						<BrushSettings />
					</Section>
				)}
				<Arrange editing={editing} overlay={selected} />
			</>
		);
	}

	return (
		<>
			<PanelTitle>{m.tool_layers()}</PanelTitle>
			<Section
				title={m.layers_applied()}
				action={
					<span className="bg-surface text-small tabular grid h-6 min-w-6 place-items-center rounded-full px-2 font-semibold">
						{editing.overlays.length}
					</span>
				}
			>
				{editing.overlays.length > 0 ? (
					<>
						<LayerList editing={editing} />
						{editing.overlays.length > 1 && (
							<p className="text-small text-muted">{m.layers_order_hint()}</p>
						)}
					</>
				) : (
					<p className="text-small text-muted">{m.layers_empty()}</p>
				)}
			</Section>
			<Section title={m.layers_add()}>
				<div role="tablist" aria-label={m.layers_add()} className="grid grid-cols-5 gap-1.5">
					{(['text', 'sticker', 'shape', 'zone', 'draw'] as const).map((kind) => {
						const Icon = ADD_ICONS[kind];
						return (
							<button
								key={kind}
								type="button"
								role="tab"
								aria-selected={adding === kind}
								onClick={() => {
									setAdding(adding === kind ? null : kind);
								}}
								className="text-caption text-ink-2 hover:bg-surface hover:text-ink aria-selected:bg-ed-soft aria-selected:text-ink grid justify-items-center gap-1.5 rounded-sm px-1 pt-2.5 pb-2 font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow,color] aria-selected:shadow-[inset_0_0_0_1.5px_var(--ed)]"
							>
								<span className="relative">
									<Icon size={18} aria-hidden="true" />
									<Plus
										size={11}
										strokeWidth={3}
										className="bg-bg absolute -right-1.5 -bottom-1 rounded-full"
										aria-hidden="true"
									/>
								</span>
								{ADD_LABELS[kind]()}
							</button>
						);
					})}
				</div>
				{adding === 'text' && <TextStyles onAdd={addText} />}
				{adding === 'sticker' && <StickerPicker onAdd={add} />}
				{adding === 'shape' && <ShapePicker color="#ff3b30" onAdd={add} />}
				{adding === 'zone' && (
					<ZoneEffects
						label={m.layers_add_zone()}
						value={null}
						onChoose={(effect) => {
							add(createZone(effect));
						}}
					/>
				)}
				{adding === 'draw' && <BrushSettings />}
			</Section>
		</>
	);
}
