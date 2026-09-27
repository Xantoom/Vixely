import { FormatGroups } from '@/editor/FormatGroups';
import { Section } from '@/editor/panel-parts';
import { m } from '@/paraglide/messages.js';
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
			<FormatGroups
				groups={PRESET_GROUPS.map((group) => ({
					title: group.title(),
					logo: group.logo,
					choices: group.presets.map((preset) => ({
						id: preset.id,
						label: preset.label(),
						detail: `${preset.width} × ${preset.height} · ${FORMAT_INFO[preset.format].extension.toUpperCase()}`,
						width: preset.width,
						height: preset.height,
					})),
				}))}
				chosen={chosen}
				onChoose={(id) => {
					const preset = PRESET_GROUPS.flatMap((group) => group.presets).find((item) => item.id === id);
					if (preset) choose(preset);
				}}
			/>
		</Section>
	);
}
