import { FlipHorizontal2, FlipVertical2, Link2, RotateCcw, RotateCw, Unlink2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ASPECT_LABELS, Group, ResetButton, Section, ToolButton } from '@/editor/panel-parts';
import { ICO_SIZES } from '@/media/image-formats';
import type { PhotoMetadata } from '@/media/probe';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { FieldRow, NumberField, OptionList, Select, type SelectOption, Slider } from '@/ui/fields';
import { TRACKS } from '@/ui/tracks';
import { containRect, fitRatio } from './crop';
import {
	ADJUSTMENT_RANGE,
	type AdjustmentId,
	effectiveCrop,
	fitWithin,
	flip,
	isAdjusted,
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

/** Crop, rotation and mirrors of a picture: an image, or the frames of a video. */
export function CropPanel({ editing }: { editing: PictureEditing }) {
	const { doc, apply, aspect, setAspect, size: source } = editing;
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
						disabled={doc.crop === null && doc.rotation === 0 && !doc.flipX && !doc.flipY}
						onClick={() => {
							setAspect('free');
							apply((d) => ({ ...d, crop: null, rotation: 0, flipX: false, flipY: false }));
						}}
					/>
				}
			>
				{m.tool_crop()}
			</PanelTitle>

			<Section title={m.crop_aspect()}>
				<OptionList
					label={m.crop_aspect()}
					value={aspect}
					onChange={chooseAspect}
					options={[...ASPECTS, ...(isFixedAspect(aspect) ? [] : [aspect])].map((id) => {
						const r = cropRatio(id, bounds);
						const size = id === 'free' ? crop : r === null ? bounds : fitRatio(full, r);
						const label = isFixedAspect(id) ? ASPECT_LABELS[id]() : id;
						return { value: id, label, detail: `${size.width} × ${size.height}` };
					})}
				/>
			</Section>

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

/** Longest sides offered as export sizes, when smaller than the crop. */
const SIZE_STEPS = [3840, 2560, 1920, 1600, 1280, 1080, 800, 640];

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
	// Width and height move together unless unlinked.
	const [linked, setLinked] = useState(true);

	useEffect(() => {
		void canEncodeWebp().then(setWebp);
	}, []);

	const crop = effectiveCrop(doc, source);
	const longest = Math.max(crop.width, crop.height);
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
	const sizes: SelectOption<string>[] = [
		{ value: 'original', label: m.size_original() },
		...SIZE_STEPS.filter((step) => step < longest).map((step) => {
			const size = fitWithin(crop, step);
			return { value: String(step), label: `${size.width} × ${size.height}` };
		}),
		{ value: 'custom', label: m.size_custom() },
	];
	const sizeChoice = settings.exact
		? 'custom'
		: settings.longestSide === null
			? 'original'
			: String(settings.longestSide);

	const setWidth = (width: number) => {
		const height = linked ? Math.max(1, Math.round((width * current.height) / current.width)) : current.height;
		setExport({ exact: { width, height }, longestSide: null });
	};
	const setHeight = (height: number) => {
		const width = linked ? Math.max(1, Math.round((height * current.width) / current.height)) : current.width;
		setExport({ exact: { width, height }, longestSide: null });
	};
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
				{settings.format !== 'ico' && (
					<FieldRow label={m.export_size()} htmlFor="export-size">
						<Select
							id="export-size"
							value={sizeChoice}
							options={sizes}
							onChange={(value) => {
								if (value === 'custom') setExport({ exact: current, longestSide: null });
								else
									setExport({
										exact: null,
										longestSide: value === 'original' ? null : Number(value),
									});
							}}
						/>
					</FieldRow>
				)}
				{settings.exact && settings.format !== 'ico' && (
					<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
						<label className="grid gap-1.5">
							<span className="text-ui text-ink-2">{m.field_width()}</span>
							<NumberField value={current.width} unit="px" min={1} max={16384} onCommit={setWidth} />
						</label>
						<IconButton
							label={m.size_link()}
							aria-pressed={linked}
							onClick={() => {
								setLinked((value) => !value);
							}}
						>
							{linked ? <Link2 className="size-5" /> : <Unlink2 className="size-5" />}
						</IconButton>
						<label className="grid gap-1.5">
							<span className="text-ui text-ink-2">{m.field_height()}</span>
							<NumberField value={current.height} unit="px" min={1} max={16384} onCommit={setHeight} />
						</label>
					</div>
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
			<p className="text-small text-muted">
				{settings.format === 'ico'
					? m.export_output({ size: iconSizes.join(', ') })
					: m.export_output({ size: `${current.width} × ${current.height}` })}
				{hasMetadata && !keepsMetadata(settings.format) ? ` ${m.metadata_dropped()}` : ''}
			</p>
		</>
	);
}
