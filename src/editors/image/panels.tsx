import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ASPECT_LABELS, ResetButton, Section, ToolButton } from '@/editor/panel-parts';
import type { PhotoMetadata } from '@/media/probe';
import { m } from '@/paraglide/messages.js';
import { FieldRow, NumberField, OptionList, Select, type SelectOption, Slider } from '@/ui/fields';
import { containRect, fitRatio } from './crop';
import {
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
import { canEncodeWebp, outputSize, usesQuality } from './export';
import {
	ASPECTS,
	type AspectId,
	cropRatio,
	type ImageFormat,
	turnedAspect,
	useImageDoc,
	useImageEditor,
} from './store';

export function CropPanel({ source }: { source: ImageBitmap }) {
	const doc = useImageDoc();
	const apply = useImageEditor((state) => state.apply);
	const aspect = useImageEditor((state) => state.cropAspect);
	const setAspect = useImageEditor((state) => state.setCropAspect);
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
					options={ASPECTS.map((id) => {
						const r = cropRatio(id, bounds);
						const size = id === 'free' ? crop : r === null ? bounds : fitRatio(full, r);
						return { value: id, label: ASPECT_LABELS[id](), detail: `${size.width} × ${size.height}` };
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
	saturation: () => m.adjust_saturation(),
	temperature: () => m.adjust_temperature(),
	tint: () => m.adjust_tint(),
};

const LIGHT: AdjustmentId[] = ['exposure', 'brightness', 'contrast'];
const COLOR: AdjustmentId[] = ['saturation', 'temperature', 'tint'];

export function AdjustPanel() {
	const doc = useImageDoc();
	const apply = useImageEditor((state) => state.apply);
	const preview = useImageEditor((state) => state.preview);
	const settle = useImageEditor((state) => state.settle);

	const slider = (id: AdjustmentId) => (
		<Slider
			key={id}
			label={ADJUSTMENT_LABELS[id]()}
			value={doc.adjust[id]}
			min={-100}
			max={100}
			onChange={(value) => {
				preview((d) => ({ ...d, adjust: { ...d.adjust, [id]: value } }));
			}}
			onEnd={settle}
		/>
	);

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
			<Section title={m.adjust_light()}>
				<div className="grid gap-5">{LIGHT.map(slider)}</div>
			</Section>
			<Section title={m.adjust_color()}>
				<div className="grid gap-5">{COLOR.map(slider)}</div>
			</Section>
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

	useEffect(() => {
		void canEncodeWebp().then(setWebp);
	}, []);

	const crop = effectiveCrop(doc, source);
	const longest = Math.max(crop.width, crop.height);
	const current = outputSize(doc, source, settings);
	const lossless = settings.format === 'jxl' && settings.quality >= 100;

	const formats: SelectOption<ImageFormat>[] = [
		{ value: 'jpeg', label: 'JPEG' },
		{ value: 'png', label: 'PNG' },
		{ value: 'webp', label: 'WebP', disabled: !webp },
		{ value: 'avif', label: 'AVIF' },
		{ value: 'jxl', label: 'JPEG XL' },
	];
	const sizes: SelectOption<string>[] = [
		{ value: 'original', label: m.size_original() },
		...SIZE_STEPS.filter((step) => step < longest).map((step) => {
			const size = fitWithin(crop, step);
			return { value: String(step), label: `${size.width} × ${size.height}` };
		}),
	];

	return (
		<>
			<PanelTitle>{m.export_image_title()}</PanelTitle>
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
				{photo && photo.exifFull.length > 0 && settings.format !== 'webp' && (
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
				<FieldRow label={m.export_size()} htmlFor="export-size">
					<Select
						id="export-size"
						value={settings.longestSide === null ? 'original' : String(settings.longestSide)}
						options={sizes}
						onChange={(value) => {
							setExport({ longestSide: value === 'original' ? null : Number(value) });
						}}
					/>
				</FieldRow>
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
				{m.export_output({ size: `${current.width} × ${current.height}` })}
				{photo && photo.exifFull.length > 0 && settings.format === 'webp' ? ` ${m.metadata_webp()}` : ''}
			</p>
		</>
	);
}
