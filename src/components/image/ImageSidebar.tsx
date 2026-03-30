import { Lock, Unlock, Maximize2, SlidersHorizontal, Palette, Download } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { SharedPresetsPanel, type PresetEntry } from '@/components/shared/PresetsPanel.tsx';
import { Button, CollapsibleSection, Slider } from '@/components/ui/index.ts';
import { ToolRail, type ToolRailItem } from '@/components/ui/ToolRail.tsx';
import {
	LIGHT_SLIDERS,
	COLOR_SLIDERS,
	EFFECT_SLIDERS as EFFECTS_SLIDERS,
	type FilterSliderDef,
} from '@/config/filterSliders.ts';
import { filterPresetEntries, imagePresetEntries } from '@/config/presets.ts';
import { buildFallbackFilterString } from '@/modules/photo-editor/render/fallback-filters.ts';
import { PhotoWebGLRenderer } from '@/modules/photo-editor/render/webgl-renderer.ts';
import { DEFAULT_FILTER_PARAMS } from '@/modules/shared-core/types/filters.ts';
import type { FilterParams } from '@/modules/shared-core/types/filters.ts';
import { filtersAreDefault } from '@/modules/shared-core/types/filters.ts';
import { useImageEditorStore, type ExportFormat } from '@/stores/imageEditor.ts';
import { buildExportFilename } from '@/utils/exportFilename.ts';
import { formatFileSize, estimateImageSize } from '@/utils/format.ts';
import { ImageInfoModal } from './ImageInfoModal.tsx';

const FILTER_PRESETS = filterPresetEntries();
const IMAGE_PRESETS = imagePresetEntries();

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
	{ value: 'png', label: 'PNG' },
	{ value: 'jpeg', label: 'JPEG' },
	{ value: 'webp', label: 'WebP' },
];

type ImageMode = 'resize' | 'adjust' | 'presets' | 'export';

function countSliderChanges(sliders: FilterSliderDef[], filters: FilterParams): number {
	let count = 0;
	for (const s of sliders) {
		if (filters[s.key] !== DEFAULT_FILTER_PARAMS[s.key]) count++;
	}
	return count;
}

const IMAGE_TOOLS: ToolRailItem<ImageMode>[] = [
	{ id: 'resize', label: 'Resize', icon: Maximize2 },
	{ id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
	{ id: 'presets', label: 'Presets', icon: Palette },
	{ id: 'export', label: 'Export', icon: Download },
];

interface ImageSidebarProps {
	showInfo: boolean;
	onShowInfoChange: (show: boolean) => void;
}

export function ImageSidebar({ showInfo, onShowInfoChange }: ImageSidebarProps) {
	const {
		file,
		originalData,
		filters,
		exportFormat,
		exportQuality,
		resizeWidth,
		resizeHeight,
		resizeLockAspect,
		setFilter,
		commitFilters,
		applyFilterPreset,
		resetFilters,
		setExportFormat,
		setExportQuality,
		setShowOriginal,
		setResizeWidth,
		setResizeHeight,
		setResizeLockAspect,
		applyResize,
	} = useImageEditorStore(
		useShallow((s) => ({
			file: s.file,
			originalData: s.originalData,
			filters: s.filters,
			exportFormat: s.exportFormat,
			exportQuality: s.exportQuality,
			resizeWidth: s.resizeWidth,
			resizeHeight: s.resizeHeight,
			resizeLockAspect: s.resizeLockAspect,
			setFilter: s.setFilter,
			commitFilters: s.commitFilters,
			applyFilterPreset: s.applyFilterPreset,
			resetFilters: s.resetFilters,
			setExportFormat: s.setExportFormat,
			setExportQuality: s.setExportQuality,
			setShowOriginal: s.setShowOriginal,
			setResizeWidth: s.setResizeWidth,
			setResizeHeight: s.setResizeHeight,
			setResizeLockAspect: s.setResizeLockAspect,
			applyResize: s.applyResize,
		})),
	);

	const [mode, setMode] = useState<ImageMode>('resize');
	const [selectedImagePreset, setSelectedImagePreset] = useState<string | null>(null);
	const exportRendererRef = useRef<PhotoWebGLRenderer | null>(null);
	const resizeWidthInputId = useId();
	const resizeHeightInputId = useId();

	const imagePresetEntryList: PresetEntry[] = useMemo(
		() =>
			IMAGE_PRESETS.map(([key, preset]) => ({
				key,
				name: preset.name,
				subtitle: `${preset.width ?? '?'}×${preset.height ?? '?'} · ${preset.format.toUpperCase()}`,
			})),
		[],
	);

	const handleSliderCommit = useCallback(() => {
		commitFilters();
	}, [commitFilters]);

	const handleExport = useCallback(async () => {
		if (!originalData) return;

		const mimeType = `image/${exportFormat}`;
		const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
		const quality = exportFormat === 'png' ? undefined : exportQuality / 100;
		let blob: Blob | null = null;

		try {
			// Create an offscreen WebGL renderer for export
			const offscreen = new OffscreenCanvas(originalData.width, originalData.height);
			if (!exportRendererRef.current) {
				exportRendererRef.current = new PhotoWebGLRenderer(offscreen);
			}
			const renderer = exportRendererRef.current;
			renderer.loadImageData(originalData);
			renderer.render(filters);

			// Read from the WebGL canvas
			const canvas = renderer.canvas;
			if (!(canvas instanceof OffscreenCanvas)) {
				throw new Error('WebGL export canvas unavailable');
			}
			blob = await canvas.convertToBlob({ type: mimeType, quality });
		} catch (err) {
			console.warn('[image] WebGL export failed, falling back to 2D canvas export', err);
			const fallbackCanvas = new OffscreenCanvas(originalData.width, originalData.height);
			const ctx = fallbackCanvas.getContext('2d');
			if (!ctx) {
				toast.error('Export failed');
				return;
			}

			const bitmap = await createImageBitmap(originalData);
			try {
				ctx.clearRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
				ctx.filter = buildFallbackFilterString(filters);
				ctx.drawImage(bitmap, 0, 0);
				ctx.filter = 'none';
			} finally {
				bitmap.close();
			}

			blob = await fallbackCanvas.convertToBlob({ type: mimeType, quality });
			toast('Exported with compatibility renderer');
		}
		if (!blob) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = buildExportFilename(file?.name, ext);
		a.click();
		URL.revokeObjectURL(a.href);
		toast.success('Image exported', { description: formatFileSize(blob.size) });
	}, [file, originalData, exportFormat, exportQuality, filters]);

	const handleApplyResize = useCallback(() => {
		applyResize();
	}, [applyResize]);

	const handleApplyPreset = useCallback(
		(key: string | null) => {
			if (!key) {
				setSelectedImagePreset(null);
				return;
			}
			const preset = IMAGE_PRESETS.find(([k]) => k === key);
			if (!preset) return;
			const [, cfg] = preset;
			setSelectedImagePreset(key);
			if (cfg.width != null) setResizeWidth(cfg.width);
			if (cfg.height != null) setResizeHeight(cfg.height);
			if (cfg.exportFormat) setExportFormat(cfg.exportFormat as ExportFormat);
			if (cfg.exportQuality != null) setExportQuality(cfg.exportQuality);
			toast(`Applied "${cfg.name}"`);
		},
		[setResizeWidth, setResizeHeight, setExportFormat, setExportQuality],
	);

	const renderSliders = (sliders: FilterSliderDef[]) => (
		<div className="flex flex-col gap-3">
			{sliders.map((s) => (
				<Slider
					key={s.key}
					label={s.label}
					displayValue={s.format(filters[s.key])}
					min={s.min}
					max={s.max}
					step={s.step}
					value={filters[s.key]}
					onChange={(e) => {
						setFilter(s.key, Number((e.target as HTMLInputElement).value));
					}}
					onCommit={handleSliderCommit}
				/>
			))}
		</div>
	);

	const estSize = originalData
		? estimateImageSize(
				resizeWidth ?? originalData.width,
				resizeHeight ?? originalData.height,
				exportFormat,
				exportQuality,
			)
		: null;
	const hasResizeChanges =
		originalData != null &&
		resizeWidth != null &&
		resizeHeight != null &&
		(resizeWidth !== originalData.width || resizeHeight !== originalData.height);
	const hasAdjustChanges = !filtersAreDefault(filters);
	const modeActivity: Record<ImageMode, boolean> = {
		resize: hasResizeChanges,
		adjust: hasAdjustChanges,
		presets: hasAdjustChanges || hasResizeChanges,
		export: false,
	};
	const toolItems: ToolRailItem<ImageMode>[] = useMemo(
		() => IMAGE_TOOLS.map((tool) => ({ ...tool, hasActivity: modeActivity[tool.id] })),
		[modeActivity],
	);

	return (
		<aside
			className="w-full h-full min-h-0 overflow-hidden bg-surface flex flex-col"
			style={{ overscrollBehavior: 'contain' }}
		>
			{/* ToolRail */}
			<div className="shrink-0 border-b border-border/70 bg-surface-raised/15">
				<ToolRail
					items={toolItems}
					activeId={mode}
					onChange={setMode}
					direction="horizontal"
					ariaLabel="Image editor tools"
				/>
			</div>

			{/* Panel Content */}
			<div
				className="p-3 flex flex-col gap-4 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden animate-panel-crossfade"
				key={mode}
			>
				{mode === 'resize' && (
					<>
						{originalData ? (
							<>
								<SharedPresetsPanel
									presets={imagePresetEntryList}
									selectedPreset={selectedImagePreset}
									onSelectPreset={handleApplyPreset}
									emptyLabel="Pick a preset or set custom dimensions."
									fallbackIconLetter="I"
								/>

								<div className="flex items-center gap-2">
									<div className="flex-1">
										<label
											htmlFor={resizeWidthInputId}
											className="text-[14px] text-text-tertiary mb-1 block"
										>
											W
										</label>
										<input
											id={resizeWidthInputId}
											type="number"
											min={1}
											max={8192}
											value={resizeWidth ?? ''}
											onChange={(e) => {
												setResizeWidth(e.target.value ? Number(e.target.value) : null);
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
									<button
										onClick={() => {
											setResizeLockAspect(!resizeLockAspect);
										}}
										type="button"
										aria-label={resizeLockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
										title={resizeLockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
										className={`mt-4 h-8 w-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
											resizeLockAspect
												? 'text-accent bg-accent/10'
												: 'text-text-tertiary hover:text-text'
										}`}
									>
										{resizeLockAspect ? <Lock size={12} /> : <Unlock size={12} />}
									</button>
									<div className="flex-1">
										<label
											htmlFor={resizeHeightInputId}
											className="text-[14px] text-text-tertiary mb-1 block"
										>
											H
										</label>
										<input
											id={resizeHeightInputId}
											type="number"
											min={1}
											max={8192}
											value={resizeHeight ?? ''}
											onChange={(e) => {
												setResizeHeight(e.target.value ? Number(e.target.value) : null);
											}}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									className="w-full"
									onClick={handleApplyResize}
									disabled={!resizeWidth || !resizeHeight}
								>
									Apply Resize
								</Button>
							</>
						) : (
							<p className="text-[14px] text-text-tertiary">Load an image to resize.</p>
						)}
					</>
				)}

				{mode === 'adjust' && (
					<>
						<div className="flex items-center justify-end">
							<button
								onClick={resetFilters}
								className="text-[12px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
							>
								Reset
							</button>
						</div>
						<CollapsibleSection title="Light" changeCount={countSliderChanges(LIGHT_SLIDERS, filters)}>
							{renderSliders(LIGHT_SLIDERS)}
						</CollapsibleSection>
						<CollapsibleSection title="Color" changeCount={countSliderChanges(COLOR_SLIDERS, filters)}>
							{renderSliders(COLOR_SLIDERS)}
						</CollapsibleSection>
						<CollapsibleSection
							title="Effects"
							changeCount={countSliderChanges(EFFECTS_SLIDERS, filters)}
							defaultCollapsed
						>
							{renderSliders(EFFECTS_SLIDERS)}
						</CollapsibleSection>
					</>
				)}

				{mode === 'presets' && (
					<>
						<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
							Color Presets
						</h3>
						<div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
							{FILTER_PRESETS.map(([key, preset]) => (
								<button
									key={key}
									onClick={() => {
										applyFilterPreset(preset);
									}}
									className="rounded-md bg-surface-raised/60 py-2 text-[14px] font-medium text-text-tertiary hover:bg-surface-raised hover:text-text transition-all cursor-pointer"
								>
									{preset.name}
								</button>
							))}
						</div>
					</>
				)}

				{mode === 'export' && (
					<>
						<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
							Format
						</h3>
						<div className="flex gap-1.5">
							{FORMAT_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() => {
										setExportFormat(opt.value);
									}}
									className={`flex-1 rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
										exportFormat === opt.value
											? 'bg-accent/15 text-accent border border-accent/30'
											: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised hover:text-text'
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
						{exportFormat !== 'png' && (
							<Slider
								label="Quality"
								displayValue={`${exportQuality}`}
								min={1}
								max={100}
								step={1}
								value={exportQuality}
								onChange={(e) => {
									setExportQuality(Number((e.target as HTMLInputElement).value));
								}}
							/>
						)}
						{estSize != null && (
							<p className="text-[14px] text-text-tertiary">Est. {formatFileSize(estSize)}</p>
						)}
					</>
				)}
			</div>

			{/* Actions — only visible when a file is loaded */}
			{originalData && (
				<div className="p-3 border-t border-border flex flex-col gap-2 shrink-0 bg-surface-raised/10">
					<Button
						variant="ghost"
						size="sm"
						className="w-full"
						onPointerDown={() => {
							setShowOriginal(true);
						}}
						onPointerUp={() => {
							setShowOriginal(false);
						}}
						onPointerLeave={() => {
							setShowOriginal(false);
						}}
					>
						Hold to Compare
					</Button>
					<Button
						className="w-full"
						onClick={() => {
							void handleExport();
						}}
					>
						Export
					</Button>
				</div>
			)}

			{/* Info modal */}
			{showInfo && file && originalData && (
				<ImageInfoModal
					file={file}
					width={originalData.width}
					height={originalData.height}
					onClose={() => {
						onShowInfoChange(false);
					}}
				/>
			)}
		</aside>
	);
}
