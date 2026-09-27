import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ASPECT_LABELS, Group, ResetButton, Section, ToolButton } from '@/editor/panel-parts';
import { decimal } from '@/lib/format';
import { ICO_SIZES } from '@/media/image-formats';
import type { PhotoMetadata } from '@/media/probe';
import { m } from '@/paraglide/messages.js';
import { FieldRow, NumberField, Select, type SelectOption, Slider, Switch } from '@/ui/fields';
import { TRACKS } from '@/ui/tracks';
import { containRect, fitRatio } from './crop';
import {
	ADJUSTMENT_RANGE,
	type AdjustmentId,
	effectiveCrop,
	flip,
	isAdjusted,
	MAX_ANGLE,
	NEUTRAL_ADJUSTMENTS,
	orientedSize,
	type Rect,
	rotate,
} from './document';
import type { PictureEditing } from './editing';
import { canEncodeWebp, keepsMetadata, outputSize, usesQuality } from './export';
import { LookStrip } from './LookStrip';
import { findPreset, presetGroupTitle } from './presets';
import {
	ASPECTS,
	type AspectId,
	cropRatio,
	type ImageFormat,
	isFixedAspect,
	turnedAspect,
	useImageDoc,
	useImageEditor,
} from './store';

interface AspectTile {
	id: AspectId;
	label: string;
	/** Width over height of the shape drawn. */
	ratio: number;
	size: { width: number; height: number };
}

/** The crop's shapes as tiles, each drawn at its ratio, with the size it gives. */
function AspectTiles({
	value,
	options,
	onChange,
}: {
	value: AspectId;
	options: AspectTile[];
	onChange: (aspect: AspectId) => void;
}) {
	return (
		<div role="radiogroup" aria-label={m.crop_aspect()} className="grid grid-cols-3 gap-2">
			{options.map(({ id, label, ratio, size }) => {
				// The shape fits a 30 × 22 box.
				const width = ratio >= 30 / 22 ? 30 : 22 * ratio;
				const height = ratio >= 30 / 22 ? 30 / ratio : 22;
				return (
					<button
						key={id}
						type="button"
						role="radio"
						aria-checked={id === value}
						aria-label={`${label}, ${size.width} × ${size.height}`}
						onClick={() => {
							onChange(id);
						}}
						className="group text-ink-2 hover:bg-surface aria-checked:bg-ed-soft aria-checked:text-ink grid justify-items-center gap-1.5 rounded-sm px-1 pt-3 pb-2 shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow,color] duration-150 aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)]"
					>
						<span className="grid h-6 w-9 place-items-center" aria-hidden="true">
							<span
								className={`rounded-[3px] transition-colors duration-150 ${
									id === 'free'
										? 'border-[1.5px] border-dashed border-current opacity-70'
										: 'group-aria-checked:bg-ed border-[1.5px] border-current group-aria-checked:border-(--ed)'
								}`}
								style={{ width: Math.max(8, width), height: Math.max(8, height) }}
							/>
						</span>
						<span className="text-caption font-semibold">{label}</span>
						<span className="text-caption text-muted group-aria-checked:text-ink-2 tabular font-mono text-[11px]">
							{size.width}×{size.height}
						</span>
					</button>
				);
			})}
		</div>
	);
}

/** Crop, rotation and mirrors of a picture: an image, or the frames of a video. */
export function CropPanel({ editing, formats }: { editing: PictureEditing; formats?: ReactNode }) {
	const { doc, apply, preview, settle, aspect, setAspect, size: source } = editing;
	const bounds = orientedSize(source, doc.rotation);
	const crop = effectiveCrop(doc, source);
	const full: Rect = { x: 0, y: 0, ...bounds };
	const ratio = cropRatio(aspect, bounds);

	const chooseAspect = (next: AspectId) => {
		setAspect(next);
		const nextRatio = cropRatio(next, bounds);
		if (next === 'original') apply((d) => ({ ...d, crop: null }));
		else if (nextRatio !== null) apply((d) => ({ ...d, crop: fitRatio(full, nextRatio) }));
	};

	const setGeometry = (change: Partial<Rect>) => {
		let next = { ...crop, ...change };
		if (ratio !== null) {
			if (change.width !== undefined) next.height = Math.round(next.width / ratio);
			if (change.height !== undefined) next.width = Math.round(next.height * ratio);
		}
		next = containRect(next, bounds);
		apply((d) => ({ ...d, crop: next }));
	};

	const turn = (direction: 1 | -1) => {
		apply((d) => rotate(d, source, direction));
		setAspect(turnedAspect(aspect));
	};

	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={doc.crop === null && doc.rotation === 0 && !doc.flipX && !doc.flipY && !doc.angle}
						onClick={() => {
							setAspect('original');
							apply((d) => ({ ...d, crop: null, rotation: 0, flipX: false, flipY: false, angle: 0 }));
						}}
					/>
				}
			>
				{m.tool_crop()}
			</PanelTitle>

			<Section title={m.crop_aspect()}>
				<AspectTiles
					value={aspect}
					onChange={chooseAspect}
					options={[...ASPECTS, ...(isFixedAspect(aspect) ? [] : [aspect])].map((id) => {
						const r = cropRatio(id, bounds);
						const size = id === 'free' ? crop : r === null ? bounds : fitRatio(full, r);
						const label = isFixedAspect(id) ? ASPECT_LABELS[id]() : id;
						return { id, label, ratio: r ?? size.width / size.height, size };
					})}
				/>
			</Section>

			{formats}

			<Section title={m.crop_orientation()}>
				<div className="grid grid-cols-4 gap-2">
					<ToolButton
						label={m.rotate_left()}
						caption={m.rotate_left_short()}
						icon={<RotateCcw size={18} aria-hidden="true" />}
						onClick={() => {
							turn(-1);
						}}
					/>
					<ToolButton
						label={m.rotate_right()}
						caption={m.rotate_right_short()}
						icon={<RotateCw size={18} aria-hidden="true" />}
						onClick={() => {
							turn(1);
						}}
					/>
					<ToolButton
						label={m.flip_horizontal()}
						caption={m.flip_horizontal_short()}
						icon={<FlipHorizontal2 size={18} aria-hidden="true" />}
						onClick={() => {
							apply((d) => flip(d, source, 'x'));
						}}
					/>
					<ToolButton
						label={m.flip_vertical()}
						caption={m.flip_vertical_short()}
						icon={<FlipVertical2 size={18} aria-hidden="true" />}
						onClick={() => {
							apply((d) => flip(d, source, 'y'));
						}}
					/>
				</div>
				<Slider
					label={m.crop_straighten()}
					value={doc.angle ?? 0}
					min={-MAX_ANGLE}
					max={MAX_ANGLE}
					step={0.1}
					defaultValue={0}
					format={(value) => `${value > 0 ? '+' : ''}${decimal(value, 1)}°`}
					onChange={(angle) => {
						preview((d) => ({ ...d, angle }));
					}}
					onEnd={settle}
				/>
			</Section>

			<Section title={m.crop_geometry()}>
				<div className="grid gap-2.5">
					<FieldRow label={m.field_width()} htmlFor="crop-w">
						<NumberField
							id="crop-w"
							value={crop.width}
							unit="px"
							min={16}
							max={bounds.width}
							onCommit={(width) => {
								setGeometry({ width });
							}}
						/>
					</FieldRow>
					<FieldRow label={m.field_height()} htmlFor="crop-h">
						<NumberField
							id="crop-h"
							value={crop.height}
							unit="px"
							min={16}
							max={bounds.height}
							onCommit={(height) => {
								setGeometry({ height });
							}}
						/>
					</FieldRow>
					<FieldRow label="X" htmlFor="crop-x">
						<NumberField
							id="crop-x"
							value={crop.x}
							unit="px"
							min={0}
							max={bounds.width}
							onCommit={(x) => {
								setGeometry({ x });
							}}
						/>
					</FieldRow>
					<FieldRow label="Y" htmlFor="crop-y">
						<NumberField
							id="crop-y"
							value={crop.y}
							unit="px"
							min={0}
							max={bounds.height}
							onCommit={(y) => {
								setGeometry({ y });
							}}
						/>
					</FieldRow>
				</div>
			</Section>
		</>
	);
}

const ADJUSTMENT_LABELS: Record<AdjustmentId, () => string> = {
	exposure: () => m.adjust_exposure(),
	brightness: () => m.adjust_brightness(),
	contrast: () => m.adjust_contrast(),
	highlights: () => m.adjust_highlights(),
	shadows: () => m.adjust_shadows(),
	temperature: () => m.adjust_temperature(),
	tint: () => m.adjust_tint(),
	saturation: () => m.adjust_saturation(),
	hue: () => m.adjust_hue(),
	sepia: () => m.adjust_sepia(),
	blur: () => m.adjust_blur(),
	vignette: () => m.adjust_vignette(),
	grain: () => m.adjust_grain(),
};

const ADJUSTMENT_GROUPS: { title: () => string; ids: AdjustmentId[] }[] = [
	{ title: () => m.adjust_light(), ids: ['exposure', 'brightness', 'contrast', 'highlights', 'shadows'] },
	{ title: () => m.adjust_color(), ids: ['temperature', 'tint', 'saturation', 'hue'] },
	{ title: () => m.adjust_effects(), ids: ['sepia', 'blur', 'vignette', 'grain'] },
];

const ADJUSTMENT_TRACKS: Partial<Record<AdjustmentId, string>> = {
	exposure: TRACKS.light,
	highlights: TRACKS.highlights,
	shadows: TRACKS.shadows,
	temperature: TRACKS.temperature,
	tint: TRACKS.tint,
	saturation: TRACKS.saturation,
	hue: TRACKS.hue,
	sepia: TRACKS.sepia,
	vignette: TRACKS.vignette,
};

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

const ADJUSTMENT_FORMATS: Partial<Record<AdjustmentId, (value: number) => string>> = {
	hue: (value) => `${signed(value)}°`,
	sepia: String,
	blur: String,
	grain: String,
};

/** Light, colour and effects of a picture: an image, or the frames of a video. */
export function AdjustPanel({ editing }: { editing: PictureEditing }) {
	const { doc, apply, preview, settle } = editing;

	const slider = (id: AdjustmentId) => {
		const [min, max] = ADJUSTMENT_RANGE[id];
		return (
			<Slider
				key={id}
				label={ADJUSTMENT_LABELS[id]()}
				value={doc.adjust[id]}
				min={min}
				max={max}
				track={ADJUSTMENT_TRACKS[id]}
				format={ADJUSTMENT_FORMATS[id]}
				onChange={(value) => {
					preview((d) => ({ ...d, adjust: { ...d.adjust, [id]: value } }));
				}}
				onEnd={settle}
			/>
		);
	};

	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={!isAdjusted(doc.adjust)}
						onClick={() => {
							apply((d) => ({ ...d, adjust: NEUTRAL_ADJUSTMENTS }));
						}}
					/>
				}
			>
				{m.tool_adjust()}
			</PanelTitle>
			<LookStrip editing={editing} />
			{ADJUSTMENT_GROUPS.map(({ title, ids }) => (
				<Group
					key={ids[0]}
					title={title()}
					changed={ids.some((id) => doc.adjust[id] !== 0)}
					onReset={() => {
						apply((d) => ({
							...d,
							adjust: { ...d.adjust, ...Object.fromEntries(ids.map((id) => [id, 0])) },
						}));
					}}
				>
					{ids.map(slider)}
				</Group>
			))}
		</>
	);
}

function qualityLevel(quality: number): string {
	if (quality >= 90) return m.quality_top();
	if (quality >= 75) return m.quality_good();
	if (quality >= 50) return m.quality_fair();
	return m.quality_low();
}

export function ExportPanel({ source, photo }: { source: ImageBitmap; photo: PhotoMetadata | null }) {
	const doc = useImageDoc();
	const settings = useImageEditor((state) => state.exportSettings);
	const setExport = useImageEditor((state) => state.setExport);
	const [webp, setWebp] = useState(false);

	useEffect(() => {
		void canEncodeWebp().then(setWebp);
	}, []);

	const current = outputSize(doc, source, settings);
	const lossless = settings.format === 'jxl' && settings.quality >= 100;
	const hasMetadata = photo !== null && photo.exifFull.length > 0;
	const preset = findPreset(settings.preset);

	const formats: SelectOption<ImageFormat>[] = [
		{ value: 'jpeg', label: 'JPEG' },
		{ value: 'png', label: 'PNG' },
		{ value: 'webp', label: 'WebP', disabled: !webp },
		{ value: 'avif', label: 'AVIF' },
		{ value: 'jxl', label: 'JPEG XL' },
		{ value: 'tiff', label: 'TIFF' },
		{ value: 'bmp', label: 'BMP' },
		{ value: 'ico', label: 'ICO' },
	];
	const iconSizes = ICO_SIZES.filter((side) => side <= Math.min(256, Math.max(current.width, current.height)));

	return (
		<>
			<PanelTitle>{m.export_image_title()}</PanelTitle>
			{preset && (
				<p className="bg-ed-soft text-ed-text text-ui rounded-sm px-3.5 py-2.5 font-medium">
					{m.preset_chosen({ name: `${presetGroupTitle(preset.id)} · ${preset.label()}` })}
				</p>
			)}
			<div className="grid gap-3.5">
				<FieldRow label={m.export_format()} htmlFor="export-format">
					<Select
						id="export-format"
						value={settings.format}
						options={formats}
						onChange={(format) => {
							setExport({ format });
						}}
					/>
				</FieldRow>
				{settings.format === 'png' && (
					<FieldRow label={m.png_compression()} htmlFor="export-png">
						<Select
							id="export-png"
							value={settings.pngLossy ? 'lossy' : 'lossless'}
							options={[
								{ value: 'lossless', label: m.png_lossless() },
								{ value: 'lossy', label: m.png_lossy() },
							]}
							onChange={(value) => {
								setExport({ pngLossy: value === 'lossy' });
							}}
						/>
					</FieldRow>
				)}
				{settings.format === 'avif' && (
					<FieldRow label={m.avif_encoding()} htmlFor="export-avif">
						<Select
							id="export-avif"
							value={settings.avifEffort}
							options={[
								{ value: 'fast', label: m.avif_fast() },
								{ value: 'best', label: m.avif_best() },
							]}
							onChange={(avifEffort) => {
								setExport({ avifEffort });
							}}
						/>
					</FieldRow>
				)}
				{hasMetadata && keepsMetadata(settings.format) && (
					<FieldRow label={m.export_metadata()} htmlFor="export-metadata">
						<Select
							id="export-metadata"
							value={settings.metadata}
							options={[
								{ value: 'private', label: m.metadata_private() },
								{ value: 'none', label: m.metadata_none() },
								{ value: 'all', label: m.metadata_all() },
							]}
							onChange={(metadata) => {
								setExport({ metadata });
							}}
						/>
					</FieldRow>
				)}
			</div>
			{usesQuality(settings) && (
				<Slider
					label={m.export_quality()}
					value={settings.quality}
					min={1}
					max={100}
					defaultValue={85}
					format={String}
					hint={
						<b className="text-ed-text font-semibold">
							{lossless ? m.quality_lossless() : qualityLevel(settings.quality)}
						</b>
					}
					onChange={(quality) => {
						setExport({ quality });
					}}
					onEnd={() => {}}
				/>
			)}
			{usesQuality(settings) && (
				<div className="grid gap-2.5">
					<Switch
						label={m.export_limit_weight()}
						checked={settings.maxKb !== null}
						onChange={(on) => {
							setExport({ maxKb: on ? 500 : null });
						}}
					/>
					{settings.maxKb !== null && (
						<FieldRow label={m.export_max_weight()} htmlFor="export-max-weight">
							<NumberField
								id="export-max-weight"
								value={settings.maxKb}
								unit={m.unit_kb()}
								min={10}
								max={100000}
								onCommit={(maxKb) => {
									setExport({ maxKb });
								}}
							/>
						</FieldRow>
					)}
				</div>
			)}
			<p className="text-small text-muted">
				{settings.format === 'ico'
					? m.export_output({ size: iconSizes.join(', ') })
					: m.export_output({ size: `${current.width} × ${current.height}` })}
				{hasMetadata && !keepsMetadata(settings.format) ? ` ${m.metadata_dropped()}` : ''}
			</p>
		</>
	);
}
