import { PanelTitle } from '@/editor/EditorLayout';
import { m } from '@/paraglide/messages.js';
import { fitRatio } from './crop';
import { orientedSize } from './document';
import type { PictureEditing } from './editing';
import { FORMAT_INFO } from './export';
import { type ImagePreset, PRESET_GROUPS } from './presets';
import { aspectOf, useImageEditor } from './store';

/**
 * Sizes platforms ask for, as tiles: one click crops the picture to the shape, from its middle,
 * and sets the export to the exact size and a suitable format. The crop can then be moved.
 */
export function PresetsPanel({ editing }: { editing: PictureEditing }) {
	const { doc, size, apply, setAspect } = editing;
	const chosen = useImageEditor((state) => state.exportSettings.preset);
	const setExport = useImageEditor((state) => state.setExport);
	const bounds = orientedSize(size, doc.rotation);

	const choose = (preset: ImagePreset) => {
		const ratio = preset.width / preset.height;
		setAspect(aspectOf(preset.width, preset.height));
		apply((d) => ({ ...d, crop: fitRatio({ x: 0, y: 0, ...bounds }, ratio) }));
		setExport({
			format: preset.format,
			quality: preset.quality,
			exact: { width: preset.width, height: preset.height },
			longestSide: null,
			pngLossy: false,
			preset: preset.id,
		});
	};

	return (
		<>
			<PanelTitle>{m.tool_presets()}</PanelTitle>
			{PRESET_GROUPS.map((group) => (
				<section key={group.presets[0]?.id} className="grid gap-2.5">
					<h3 className="text-caption text-muted font-semibold tracking-[0.06em] uppercase">
						{group.title()}
					</h3>
					<div className="grid gap-1.5">
						{group.presets.map((preset) => {
							const wide = preset.width >= preset.height;
							return (
								<button
									key={preset.id}
									type="button"
									aria-pressed={chosen === preset.id}
									aria-label={`${group.title()} ${preset.label()}, ${preset.width} × ${preset.height}`}
									onClick={() => {
										choose(preset);
									}}
									className="bg-surface hover:bg-surface-2 aria-pressed:bg-ed-soft aria-pressed:shadow-[inset_0_0_0_1.5px_var(--ed)] ease-spring grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-3 py-2 text-left transition-[background-color,transform] duration-200 active:scale-[0.98]"
								>
									<span className="grid size-9 place-items-center" aria-hidden="true">
										{/* The shape of the picture, drawn to scale. */}
										<span
											className="border-ink-2 rounded-[3px] border-[1.5px]"
											style={{
												width: wide ? '100%' : `${(preset.width / preset.height) * 100}%`,
												height: wide ? `${(preset.height / preset.width) * 100}%` : '100%',
											}}
										/>
									</span>
									<span className="text-ui truncate font-medium">{preset.label()}</span>
									<span className="text-small text-muted tabular text-right font-mono">
										{preset.width} × {preset.height}
										<span className="block text-caption">
											{FORMAT_INFO[preset.format].extension.toUpperCase()}
										</span>
									</span>
								</button>
							);
						})}
					</div>
				</section>
			))}
		</>
	);
}
