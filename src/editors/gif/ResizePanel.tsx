import { Link2, Unlink2 } from 'lucide-react';
import { useState } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { ResetButton, Section } from '@/editor/panel-parts';
import { ScaleChoices, SizeSummary } from '@/editor/ResizeParts';
import type { Size } from '@/editors/image/document';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { NumberField, OptionList } from '@/ui/fields';
import { naturalSize } from './document';
import { exportLayout } from './export';
import { useGifDoc, useGifEditor } from './store';

/** Widths offered, when narrower than the frame: what chats, forums and pages commonly show. */
const WIDTHS = [1080, 800, 640, 480, 320, 240, 128];

/** Largest side typed, in pixels. */
const LARGEST = 4096;

/**
 * The size the animation is exported at: typed in pixels, as a share of the frame, or from common
 * widths, and how it is scaled.
 */
export function GifResizePanel({ source }: { source: Size }) {
	const doc = useGifDoc();
	const settings = useGifEditor((state) => state.exportSettings);
	const setExport = useGifEditor((state) => state.setExport);
	// Width and height move together unless unlinked.
	const [linked, setLinked] = useState(true);

	const natural = naturalSize(doc, source);
	const current = exportLayout(doc, source, { ...settings, format: 'gif' });
	const exact = settings.exact ?? null;
	const sampling = settings.sampling ?? 'smooth';
	const untouched = exact === null && settings.width === null;
	const scale = Math.round((current.width / natural.width) * 100);

	const setSize = (size: Size) => {
		const same = size.width === natural.width && size.height === natural.height;
		setExport(same ? { exact: null, width: null } : { exact: size, width: null });
	};
	const setWidth = (width: number) => {
		const height = linked ? Math.max(1, Math.round((width * current.height) / current.width)) : current.height;
		setSize({ width, height: Math.min(height, LARGEST) });
	};
	const setHeight = (height: number) => {
		const width = linked ? Math.max(1, Math.round((height * current.width) / current.height)) : current.width;
		setSize({ width: Math.min(width, LARGEST), height });
	};
	const common = exact ? 'custom' : settings.width === null ? 'original' : String(settings.width);

	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={untouched && sampling === 'smooth'}
						onClick={() => {
							setExport({ exact: null, width: null, sampling: 'smooth' });
						}}
					/>
				}
			>
				{m.tool_resize()}
			</PanelTitle>

			<SizeSummary from={natural} to={current} />

			<Section title={m.resize_scale()}>
				<ScaleChoices
					from={natural}
					scale={scale}
					untouched={untouched}
					largest={LARGEST}
					onScale={(percent) => {
						setSize({
							width: Math.min(LARGEST, Math.max(1, Math.round((natural.width * percent) / 100))),
							height: Math.min(LARGEST, Math.max(1, Math.round((natural.height * percent) / 100))),
						});
					}}
					onOriginal={() => {
						setExport({ exact: null, width: null });
					}}
				/>
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
						{ value: 'original', label: m.size_original(), detail: `${natural.width} × ${natural.height}` },
						...WIDTHS.filter((width) => width < natural.width).map((width) => ({
							value: String(width),
							label: `${width} × ${Math.max(1, Math.round((natural.height * width) / natural.width))}`,
						})),
					]}
					onChange={(value) => {
						setExport({ exact: null, width: value === 'original' ? null : Number(value) });
					}}
				/>
			</Section>

			<Section title={m.resize_sampling()}>
				<OptionList
					label={m.resize_sampling()}
					value={sampling}
					options={[
						{ value: 'smooth', label: m.sampling_smooth(), detail: m.sampling_smooth_detail() },
						{ value: 'pixel', label: m.sampling_pixel(), detail: m.sampling_pixel_detail() },
					]}
					onChange={(value) => {
						setExport({ sampling: value });
					}}
				/>
			</Section>
		</>
	);
}
