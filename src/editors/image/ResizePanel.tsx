import { Link2, Unlink2 } from 'lucide-react';
import { useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ResetButton, Section } from '@/editor/panel-parts';
import { ScaleChoices, SizeSummary } from '@/editor/ResizeParts';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { NumberField, OptionList } from '@/ui/fields';
import { effectiveCrop, fitWithin, type Size } from './document';
import { outputSize } from './export';
import { useImageDoc, useImageEditor } from './store';

/** Longest sides offered, smaller or larger than the picture. */
const SIZE_STEPS = [7680, 3840, 2560, 1920, 1600, 1280, 1080, 800, 640];

/** Names screens are known by, for the longest sides that have one. */
const SIZE_NAMES: Partial<Record<number, string>> = {
	7680: '8K',
	3840: '4K',
	2560: 'QHD',
	1920: 'Full HD',
	1280: 'HD',
};

/** Largest side typed, in pixels: what the encoders and the canvas accept. */
const LARGEST = 16384;

/**
 * The size the picture is exported at: typed in pixels, as a share of the cropped picture, or
 * from common sizes, and how it is scaled.
 */
export function ResizePanel({ source }: { source: Size }) {
	const doc = useImageDoc();
	const settings = useImageEditor((state) => state.exportSettings);
	const setExport = useImageEditor((state) => state.setExport);
	// Width and height move together unless unlinked.
	const [linked, setLinked] = useState(true);

	const crop = effectiveCrop(doc, source);
	const longest = Math.max(crop.width, crop.height);
	const current = outputSize(doc, source, settings);
	const untouched = settings.exact === null && settings.longestSide === null;
	const scale = untouched ? 100 : Math.round((current.width / crop.width) * 100);

	const setSize = (size: Size) => {
		const same = size.width === crop.width && size.height === crop.height;
		setExport(same ? { exact: null, longestSide: null } : { exact: size, longestSide: null });
	};
	const setWidth = (width: number) => {
		const height = linked ? Math.max(1, Math.round((width * current.height) / current.width)) : current.height;
		setSize({ width, height: Math.min(height, LARGEST) });
	};
	const setHeight = (height: number) => {
		const width = linked ? Math.max(1, Math.round((height * current.width) / current.height)) : current.width;
		setSize({ width: Math.min(width, LARGEST), height });
	};
	const scaleTo = (percent: number) => {
		setSize({
			width: Math.min(LARGEST, Math.max(1, Math.round((crop.width * percent) / 100))),
			height: Math.min(LARGEST, Math.max(1, Math.round((crop.height * percent) / 100))),
		});
	};
	const common = settings.exact
		? `${settings.exact.width}x${settings.exact.height}`
		: settings.longestSide === null
			? 'original'
			: String(settings.longestSide);
	const change = (current.width * current.height) / (crop.width * crop.height);

	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={untouched && settings.sampling === 'smooth'}
						onClick={() => {
							setExport({ exact: null, longestSide: null, sampling: 'smooth' });
						}}
					/>
				}
			>
				{m.tool_resize()}
			</PanelTitle>

			<SizeSummary from={crop} to={current} />

			<Section title={m.resize_scale()}>
				<ScaleChoices
					from={crop}
					scale={scale}
					untouched={untouched}
					largest={LARGEST}
					onScale={scaleTo}
					onOriginal={() => {
						setExport({ exact: null, longestSide: null });
					}}
				/>
				{change > 1.0001 && <p className="text-small text-muted">{m.resize_upscale_note()}</p>}
			</Section>

			<Section title={m.resize_dimensions()}>
				<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
					<label className="grid gap-1.5">
						<span className="text-ui text-ink-2">{m.field_width()}</span>
						<NumberField value={current.width} unit="px" min={1} max={LARGEST} onCommit={setWidth} />
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
						<NumberField value={current.height} unit="px" min={1} max={LARGEST} onCommit={setHeight} />
					</label>
				</div>
			</Section>

			<Section title={m.resize_common()}>
				<OptionList
					label={m.resize_common()}
					value={common}
					options={[
						{ value: 'original', label: m.size_original(), detail: `${crop.width} × ${crop.height}` },
						...SIZE_STEPS.filter((step) => step !== longest).map((step) => {
							// Smaller sides follow each picture of a batch; larger ones are exact.
							const size =
								step < longest
									? fitWithin(crop, step)
									: {
											width: Math.round((crop.width * step) / longest),
											height: Math.round((crop.height * step) / longest),
										};
							return {
								value: step < longest ? String(step) : `${size.width}x${size.height}`,
								label: `${size.width} × ${size.height}`,
								detail: [SIZE_NAMES[step], step > longest ? m.resize_larger() : null]
									.filter(Boolean)
									.join(', '),
							};
						}),
					]}
					onChange={(value) => {
						if (value.includes('x')) {
							const [width = 1, height = 1] = value.split('x').map(Number);
							setExport({ exact: { width, height }, longestSide: null });
						} else {
							setExport({ exact: null, longestSide: value === 'original' ? null : Number(value) });
						}
					}}
				/>
			</Section>

			<Section title={m.resize_sampling()}>
				<OptionList
					label={m.resize_sampling()}
					value={settings.sampling}
					options={[
						{ value: 'smooth', label: m.sampling_smooth(), detail: m.sampling_smooth_detail() },
						{ value: 'pixel', label: m.sampling_pixel(), detail: m.sampling_pixel_detail() },
					]}
					onChange={(sampling) => {
						setExport({ sampling });
					}}
				/>
			</Section>
		</>
	);
}
