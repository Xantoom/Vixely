import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Section } from '@/editor/panel-parts';
import { m } from '@/paraglide/messages.js';
import { BrandLogo } from '@/ui/BrandLogo';
import { fitRatio } from './crop';
import { orientedSize } from './document';
import type { PictureEditing } from './editing';
import { FORMAT_INFO } from './export';
import { type ImagePreset, PRESET_GROUPS } from './presets';
import { aspectOf, useImageEditor } from './store';

/**
 * Sizes platforms ask for, by platform: one click crops the picture to the shape, from its
 * middle, and sets the export to the exact size and a suitable format. The crop can then be moved.
 */
export function PlatformFormats({ editing }: { editing: PictureEditing }) {
	const { doc, size, apply, setAspect } = editing;
	const chosen = useImageEditor((state) => state.exportSettings.preset);
	const setExport = useImageEditor((state) => state.setExport);
	const bounds = orientedSize(size, doc.rotation);
	const [open, setOpen] = useState<string | null>(
		() => PRESET_GROUPS.find((group) => group.presets.some((preset) => preset.id === chosen))?.logo ?? null,
	);

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
		<Section title={m.crop_formats()}>
			<div className="grid gap-1">
				{PRESET_GROUPS.map((group) => {
					const expanded = open === group.logo;
					const holds = group.presets.some((preset) => preset.id === chosen);
					return (
						<div key={group.logo} className="grid">
							<button
								type="button"
								aria-expanded={expanded}
								aria-label={group.title()}
								onClick={() => {
									setOpen(expanded ? null : group.logo);
								}}
								className="hover:bg-surface text-ui grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-sm px-2 py-1.5 text-left font-medium transition-colors"
							>
								<BrandLogo logo={group.logo} size={26} />
								<span className="truncate">{group.title()}</span>
								{holds ? (
									<span className="bg-ed size-1.5 rounded-full" aria-hidden="true" />
								) : (
									<span className="text-caption text-muted tabular">{group.presets.length}</span>
								)}
								<ChevronDown
									size={16}
									aria-hidden="true"
									className={`text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
								/>
							</button>
							{expanded && (
								<div className="menu-in grid gap-1 py-1 pl-[2.6rem]">
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
												className="bg-surface hover:bg-surface-2 aria-pressed:bg-ed-soft aria-pressed:shadow-[inset_0_0_0_1.5px_var(--ed)] ease-spring grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left transition-[background-color,transform] duration-200 active:scale-[0.98]"
											>
												<span className="grid size-6 place-items-center" aria-hidden="true">
													{/* The shape of the picture, drawn to scale. */}
													<span
														className="border-ink-2 rounded-[2px] border-[1.5px]"
														style={{
															width: wide
																? '100%'
																: `${(preset.width / preset.height) * 100}%`,
															height: wide
																? `${(preset.height / preset.width) * 100}%`
																: '100%',
														}}
													/>
												</span>
												<span className="grid min-w-0">
													<span className="text-ui truncate">{preset.label()}</span>
													<span className="text-caption text-muted tabular font-mono">
														{preset.width} × {preset.height} ·{' '}
														{FORMAT_INFO[preset.format].extension.toUpperCase()}
													</span>
												</span>
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</Section>
	);
}
