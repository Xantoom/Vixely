import { Link2, Unlink2 } from 'lucide-react';
import { useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ResetButton, Section } from '@/editor/panel-parts';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { NumberField, OptionList } from '@/ui/fields';
import { effectiveCrop, fitWithin, type Size } from './document';
import { outputSize } from './export';
import { useImageDoc, useImageEditor } from './store';

/** Longest sides offered, when smaller than the picture. */
const SIZE_STEPS = [3840, 2560, 1920, 1600, 1280, 1080, 800, 640];

const SCALES = [25, 50, 75, 100];

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
	const common = settings.exact
		? 'custom'
		: settings.longestSide === null
			? 'original'
			: String(settings.longestSide);

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
				<div role="radiogroup" aria-label={m.resize_scale()} className="grid grid-cols-4 gap-1.5">
					{SCALES.map((percent) => (
						<button
							key={percent}
							type="button"
							role="radio"
							aria-checked={
								scale === percent && (percent !== 100 || untouched || settings.exact !== null)
							}
							onClick={() => {
								setSize({
									width: Math.max(1, Math.round((crop.width * percent) / 100)),
									height: Math.max(1, Math.round((crop.height * percent) / 100)),
								});
							}}
							className="text-ui tabular text-ink-2 hover:bg-surface aria-checked:bg-ed-soft aria-checked:text-ink h-9 rounded-sm font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)]"
						>
							{percent} %
						</button>
					))}
				</div>
			</Section>

			<Section title={m.resize_common()}>
				<OptionList
					label={m.resize_common()}
					value={common}
					options={[
						{ value: 'original', label: m.size_original(), detail: `${crop.width} × ${crop.height}` },
						...SIZE_STEPS.filter((step) => step < longest).map((step) => {
							const size = fitWithin(crop, step);
							return {
								value: String(step),
								label: `${step} px`,
								detail: `${size.width} × ${size.height}`,
							};
						}),
					]}
					onChange={(value) => {
						setExport({ exact: null, longestSide: value === 'original' ? null : Number(value) });
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
