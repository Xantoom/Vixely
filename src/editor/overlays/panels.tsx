import {
	AlignCenter,
	AlignLeft,
	AlignRight,
	ArrowDownToLine,
	ArrowUpToLine,
	Bold,
	Copy,
	Italic,
	Trash2,
} from 'lucide-react';
import { type ReactNode, type RefObject, useId } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { Section } from '@/editor/panel-parts';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { Button } from '@/ui/Button';
import { FieldRow, Select, Slider, Switch, TimeField } from '@/ui/fields';
import {
	type OverlayEditing,
	type OverlayTiming,
	placeOverlay,
	updateShape,
	updateText,
	useOverlaySelection,
} from './editing';
import {
	createShape,
	createSticker,
	createText,
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
	type TextStyleId,
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

/** A few colours in one click, and the system picker for any other. */
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
	const pickerId = useId();
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
				<label
					htmlFor={pickerId}
					title={m.color_other()}
					className="relative size-7 cursor-pointer rounded-full bg-[conic-gradient(#ff3b30,#ffe14d,#34c759,#00c7be,#0a84ff,#bf5af2,#ff3b30)] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]"
				>
					<input
						id={pickerId}
						type="color"
						aria-label={m.color_other()}
						value={current}
						onChange={(event) => {
							onChange(event.target.value);
						}}
						className="absolute inset-0 size-full cursor-pointer opacity-0"
					/>
				</label>
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

export function TextPanel({
	editing,
	textRef,
}: {
	editing: OverlayEditing;
	/** The text field, focused by a double-click on the picture. */
	textRef: RefObject<HTMLTextAreaElement | null>;
}) {
	const selectedId = useOverlaySelection((state) => state.selected);
	const select = useOverlaySelection((state) => state.select);
	const selected = editing.overlays.find((overlay) => overlay.id === selectedId);
	const text = selected?.kind === 'text' ? selected : null;
	const change = (next: Parameters<typeof updateText>[1]) => {
		if (text) editing.apply(updateText(text.id, next));
	};

	const add = (style: TextStyleId) => {
		const overlay = createText(
			style,
			style === 'meme' ? m.text_placeholder_meme() : m.text_placeholder(),
			STYLE_Y[style],
		);
		editing.apply((list) => [...list, overlay]);
		select(overlay.id);
		requestAnimationFrame(() => {
			textRef.current?.select();
		});
	};

	return (
		<>
			<PanelTitle>{m.tool_text()}</PanelTitle>
			<div className="grid grid-cols-2 gap-2">
				{TEXT_STYLE_IDS.map((style) => {
					const look = TEXT_STYLES[style];
					const font = fontInfo(look.font);
					return (
						<button
							key={style}
							type="button"
							onClick={() => {
								add(style);
							}}
							className="bg-surface hover:bg-surface-2 ease-spring grid h-16 place-items-center rounded-sm px-2 transition-[background-color,transform] duration-200 active:scale-[0.97]"
						>
							<span
								className="truncate text-[1.2rem] leading-none"
								style={{
									fontFamily: `"${font.family}"`,
									fontWeight: look.bold && font.bold ? 700 : 400,
								}}
							>
								{STYLE_LABELS[style]()}
							</span>
						</button>
					);
				})}
			</div>
			{text && (
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
					<Arrange editing={editing} overlay={text} />
				</>
			)}
		</>
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

export function StickersPanel({ editing }: { editing: OverlayEditing }) {
	const selectedId = useOverlaySelection((state) => state.selected);
	const select = useOverlaySelection((state) => state.select);
	const selected = editing.overlays.find((overlay) => overlay.id === selectedId);
	const shape = selected?.kind === 'shape' ? selected : null;

	const add = (overlay: Overlay) => {
		editing.apply((list) => [...list, overlay]);
		select(overlay.id);
	};

	return (
		<>
			<PanelTitle>{m.tool_stickers()}</PanelTitle>
			{selected && selected.kind !== 'text' && (
				<div className="bg-surface grid gap-4 rounded-md p-4">
					{shape && (
						<>
							<ColorPicker
								label={m.text_color()}
								value={shape.color}
								onChange={(color) => {
									editing.apply(updateShape(shape.id, { color }));
								}}
							/>
							<Toggle
								label={m.shape_outlined()}
								pressed={shape.outlined}
								onClick={() => {
									editing.apply(updateShape(shape.id, { outlined: !shape.outlined }));
								}}
							>
								<svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
									<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.5" />
								</svg>
							</Toggle>
						</>
					)}
					<Arrange editing={editing} overlay={selected} />
				</div>
			)}
			<Section title={m.stickers_shapes()}>
				<div className="grid grid-cols-6 gap-1.5">
					{SHAPES.map((id) => (
						<button
							key={id}
							type="button"
							aria-label={SHAPE_LABELS[id]()}
							title={SHAPE_LABELS[id]()}
							onClick={() => {
								add(createShape(id, shape?.color ?? '#ff3b30'));
							}}
							className="bg-surface hover:bg-surface-2 text-ink-2 ease-spring grid aspect-square place-items-center rounded-sm transition-transform duration-200 active:scale-95"
						>
							<svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
								<path d={SHAPE_ICONS[id]} fill="currentColor" fillRule="evenodd" />
							</svg>
						</button>
					))}
				</div>
			</Section>
			{STICKER_GROUP_IDS.map((group) => (
				<Section key={group} title={GROUP_LABELS[group]()}>
					<div className="grid grid-cols-6 gap-1">
						{STICKER_GROUPS[group].map((emoji) => (
							<button
								key={emoji}
								type="button"
								aria-label={String.fromCodePoint(
									...emoji.split('-').map((code) => Number.parseInt(code, 16)),
								)}
								onClick={() => {
									add(createSticker(emoji));
								}}
								className="hover:bg-surface ease-spring grid aspect-square place-items-center rounded-sm transition-transform duration-200 hover:scale-110 active:scale-95"
							>
								<img
									src={`/stickers/${emoji}.svg`}
									alt=""
									loading="lazy"
									className="size-8"
									draggable={false}
								/>
							</button>
						))}
					</div>
				</Section>
			))}
			<p className="text-caption text-muted">{m.stickers_credit()}</p>
		</>
	);
}
