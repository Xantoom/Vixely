import { ChevronRight, Lock, Unlock, Info, FilePlus2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Button, Slider } from '@/components/ui/index.ts';
import { filterPresetEntries, imagePresetEntries } from '@/config/presets.ts';
import { useImageEditorStore, type Filters, type ExportFormat } from '@/stores/imageEditor.ts';
import { formatFileSize, estimateImageSize } from '@/utils/format.ts';
import { ImageInfoModal } from './ImageInfoModal.tsx';

const FILTER_PRESETS = filterPresetEntries();
const IMAGE_PRESETS = imagePresetEntries();

interface ImageSidebarProps {
	processFn: (data: ImageData, filters: Filters) => Promise<ImageData>;
	wasmReady: boolean;
	onOpenFile: () => void;
	onNew?: () => void;
}

/* ── Slider group definitions ── */

interface SliderDef {
	key: keyof Filters;
	label: string;
	min: number;
	max: number;
	step: number;
	format: (v: number) => string;
}

const LIGHT_SLIDERS: SliderDef[] = [
	{ key: 'exposure', label: 'Exposure', min: 0.2, max: 3, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}` },
	{
		key: 'brightness',
		label: 'Brightness',
		min: -0.5,
		max: 0.5,
		step: 0.01,
		format: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`,
	},
	{ key: 'contrast', label: 'Contrast', min: 0.2, max: 3, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}` },
	{
		key: 'highlights',
		label: 'Highlights',
		min: -1,
		max: 1,
		step: 0.01,
		format: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`,
	},
	{
		key: 'shadows',
		label: 'Shadows',
		min: -1,
		max: 1,
		step: 0.01,
		format: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`,
	},
];

const COLOR_SLIDERS: SliderDef[] = [
	{ key: 'saturation', label: 'Saturation', min: 0, max: 3, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}` },
	{
		key: 'temperature',
		label: 'Temperature',
		min: -1,
		max: 1,
		step: 0.01,
		format: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`,
	},
	{
		key: 'tint',
		label: 'Tint',
		min: -1,
		max: 1,
		step: 0.01,
		format: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}`,
	},
	{
		key: 'hue',
		label: 'Hue',
		min: -180,
		max: 180,
		step: 1,
		format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}\u00b0`,
	},
];

const EFFECTS_SLIDERS: SliderDef[] = [
	{ key: 'blur', label: 'Blur', min: 0, max: 20, step: 0.1, format: (v) => `${v.toFixed(1)}px` },
	{ key: 'sepia', label: 'Sepia', min: 0, max: 1, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}` },
	{ key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}` },
	{ key: 'grain', label: 'Grain', min: 0, max: 100, step: 1, format: (v) => `${v.toFixed(0)}` },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
	{ value: 'png', label: 'PNG' },
	{ value: 'jpeg', label: 'JPEG' },
	{ value: 'webp', label: 'WebP' },
];

type SectionKey = 'presets' | 'light' | 'color' | 'effects' | 'resize' | 'export';

export function ImageSidebar({ processFn, wasmReady, onOpenFile, onNew }: ImageSidebarProps) {
	const {
		file,
		originalData,
		filteredData,
		filters,
		exportFormat,
		exportQuality,
		resizeWidth,
		resizeHeight,
		resizeLockAspect,
		setFilter,
		setSliderDragging,
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
	} = useImageEditorStore();

	const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
		presets: false,
		light: false,
		color: false,
		effects: false,
		resize: false,
		export: false,
	});

	const [showInfo, setShowInfo] = useState(false);

	const toggleSection = useCallback((key: SectionKey) => {
		setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
	}, []);

	const handleSliderDown = useCallback(() => {
		setSliderDragging(true);
	}, [setSliderDragging]);

	const handleSliderCommit = useCallback(() => {
		commitFilters(processFn);
	}, [commitFilters, processFn]);

	const handleExport = useCallback(() => {
		const source = filteredData ?? originalData;
		if (!source) return;

		const mimeType = `image/${exportFormat}`;
		const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat;

		const srcCanvas = document.createElement('canvas');
		srcCanvas.width = source.width;
		srcCanvas.height = source.height;
		const srcCtx = srcCanvas.getContext('2d')!;
		srcCtx.putImageData(source, 0, 0);

		// Composite vignette if active
		if (filters.vignette > 0) {
			const grad = srcCtx.createRadialGradient(
				source.width / 2,
				source.height / 2,
				Math.min(source.width, source.height) * 0.25,
				source.width / 2,
				source.height / 2,
				Math.max(source.width, source.height) * 0.7,
			);
			grad.addColorStop(0, 'rgba(0,0,0,0)');
			grad.addColorStop(1, `rgba(0,0,0,${filters.vignette})`);
			srcCtx.fillStyle = grad;
			srcCtx.fillRect(0, 0, source.width, source.height);
		}

		// Composite grain if active
		if (filters.grain > 0) {
			const grainCanvas = document.createElement('canvas');
			grainCanvas.width = source.width;
			grainCanvas.height = source.height;
			const grainCtx = grainCanvas.getContext('2d')!;
			const grainData = grainCtx.createImageData(source.width, source.height);
			const grainPx = grainData.data;
			for (let i = 0; i < grainPx.length; i += 4) {
				const v = Math.random() * 255;
				grainPx[i] = v;
				grainPx[i + 1] = v;
				grainPx[i + 2] = v;
				grainPx[i + 3] = 255;
			}
			grainCtx.putImageData(grainData, 0, 0);

			srcCtx.globalAlpha = (filters.grain / 100) * 0.4;
			srcCtx.globalCompositeOperation = 'overlay';
			srcCtx.drawImage(grainCanvas, 0, 0);
			srcCtx.globalAlpha = 1;
			srcCtx.globalCompositeOperation = 'source-over';
		}

		const quality = exportFormat === 'png' ? undefined : exportQuality / 100;

		srcCanvas.toBlob(
			(blob) => {
				if (!blob) return;
				const a = document.createElement('a');
				a.href = URL.createObjectURL(blob);
				a.download = `vixely-export.${ext}`;
				a.click();
				URL.revokeObjectURL(a.href);
				toast.success('Image exported', { description: formatFileSize(blob.size) });
			},
			mimeType,
			quality,
		);
	}, [filteredData, originalData, exportFormat, exportQuality, filters.vignette, filters.grain]);

	const handleApplyResize = useCallback(() => {
		applyResize();
	}, [applyResize]);

	const handleApplyPreset = useCallback(
		(key: string) => {
			const preset = IMAGE_PRESETS.find(([k]) => k === key);
			if (!preset) return;
			const [, cfg] = preset;
			if (cfg.width != null) setResizeWidth(cfg.width);
			if (cfg.height != null) setResizeHeight(cfg.height);
			if (cfg.exportFormat) setExportFormat(cfg.exportFormat as ExportFormat);
			if (cfg.exportQuality != null) setExportQuality(cfg.exportQuality);
			toast(`Applied "${cfg.name}"`);
		},
		[setResizeWidth, setResizeHeight, setExportFormat, setExportQuality],
	);

	const sectionHeader = (key: SectionKey, label: string, extra?: React.ReactNode) => (
		<div className="flex items-center gap-1.5 w-full">
			<div
				role="button"
				tabIndex={0}
				onClick={() => toggleSection(key)}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						toggleSection(key);
					}
				}}
				className="flex items-center gap-1.5 flex-1 text-left cursor-pointer group"
			>
				<ChevronRight
					size={12}
					className={`text-text-tertiary transition-transform ${collapsed[key] ? '' : 'rotate-90'}`}
				/>
				<h3 className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider flex-1">
					{label}
				</h3>
			</div>
			{extra}
		</div>
	);

	const renderSliderGroup = (key: SectionKey, label: string, sliders: SliderDef[]) => (
		<div className="p-4 flex flex-col gap-3 border-b border-border">
			{sectionHeader(key, label)}
			{!collapsed[key] && (
				<div className="flex flex-col gap-3 mt-1">
					{sliders.map((s) => (
						<Slider
							key={s.key}
							label={s.label}
							displayValue={s.format(filters[s.key])}
							min={s.min}
							max={s.max}
							step={s.step}
							value={filters[s.key]}
							onChange={(e) => setFilter(s.key, Number((e.target as HTMLInputElement).value))}
							onPointerDown={handleSliderDown}
							onCommit={handleSliderCommit}
						/>
					))}
				</div>
			)}
		</div>
	);

	// Estimated file size
	const estSize = originalData
		? estimateImageSize(
				resizeWidth ?? originalData.width,
				resizeHeight ?? originalData.height,
				exportFormat,
				exportQuality,
			)
		: null;

	return (
		<aside
			className="w-72 xl:w-80 shrink-0 min-h-0 overflow-y-auto border-l border-border bg-surface flex flex-col"
			style={{ overscrollBehavior: 'contain' }}
		>
			{/* File */}
			<div className="p-4 border-b border-border">
				<div className="flex gap-2">
					<Button variant="secondary" className="flex-1 min-w-0" onClick={onOpenFile}>
						{file ? <span className="truncate">{file.name}</span> : 'Choose Image'}
					</Button>
					{file && onNew && (
						<Button variant="ghost" size="icon" onClick={onNew} title="New (discard current)">
							<FilePlus2 size={16} />
						</Button>
					)}
				</div>
				{file && (
					<div className="flex items-center gap-1.5 mt-1.5">
						<p className="text-[11px] text-text-tertiary flex-1">{formatFileSize(file.size)}</p>
						<button
							onClick={() => setShowInfo(true)}
							className="h-5 w-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
							title="File info"
						>
							<Info size={12} />
						</button>
					</div>
				)}
				{!wasmReady && <p className="mt-1.5 text-[11px] text-accent animate-pulse-soft">Loading engine...</p>}
			</div>

			{/* Color Presets */}
			<div className="p-4 border-b border-border">
				<div className="flex items-center justify-between mb-3">
					{sectionHeader(
						'presets',
						'Color Presets',
						<button
							onClick={(e) => {
								e.stopPropagation();
								resetFilters();
							}}
							className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
						>
							Reset
						</button>,
					)}
				</div>
				{!collapsed.presets && (
					<div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
						{FILTER_PRESETS.map(([key, preset]) => (
							<button
								key={key}
								onClick={() => applyFilterPreset(preset, processFn)}
								className="rounded-md bg-surface-raised/60 py-2 text-[10px] font-medium text-text-tertiary hover:bg-surface-raised hover:text-text transition-all cursor-pointer"
							>
								{preset.name}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Light */}
			{renderSliderGroup('light', 'Light', LIGHT_SLIDERS)}

			{/* Color */}
			{renderSliderGroup('color', 'Color', COLOR_SLIDERS)}

			{/* Effects */}
			{renderSliderGroup('effects', 'Effects', EFFECTS_SLIDERS)}

			{/* Resize */}
			{originalData && (
				<div className="p-4 border-b border-border">
					{sectionHeader('resize', 'Resize')}
					{!collapsed.resize && (
						<div className="mt-3">
							{/* Resize presets */}
							<div className="flex flex-wrap gap-1 mb-3">
								{IMAGE_PRESETS.map(([key, preset]) => (
									<button
										key={key}
										onClick={() => handleApplyPreset(key)}
										className="rounded-md bg-surface-raised/60 px-2 py-1 text-[9px] font-medium text-text-tertiary hover:bg-surface-raised hover:text-text transition-all cursor-pointer"
										title={preset.description}
									>
										{preset.name}
									</button>
								))}
							</div>

							<div className="flex items-center gap-2">
								<div className="flex-1">
									<label className="text-[10px] text-text-tertiary mb-1 block">W</label>
									<input
										type="number"
										min={1}
										max={8192}
										value={resizeWidth ?? ''}
										onChange={(e) => setResizeWidth(e.target.value ? Number(e.target.value) : null)}
										className="w-full h-7 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
									/>
								</div>
								<button
									onClick={() => setResizeLockAspect(!resizeLockAspect)}
									title={resizeLockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
									className={`mt-4 h-7 w-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
										resizeLockAspect
											? 'text-accent bg-accent/10'
											: 'text-text-tertiary hover:text-text'
									}`}
								>
									{resizeLockAspect ? <Lock size={12} /> : <Unlock size={12} />}
								</button>
								<div className="flex-1">
									<label className="text-[10px] text-text-tertiary mb-1 block">H</label>
									<input
										type="number"
										min={1}
										max={8192}
										value={resizeHeight ?? ''}
										onChange={(e) =>
											setResizeHeight(e.target.value ? Number(e.target.value) : null)
										}
										className="w-full h-7 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
									/>
								</div>
							</div>
							<Button
								variant="secondary"
								size="sm"
								className="w-full mt-2"
								onClick={handleApplyResize}
								disabled={!resizeWidth || !resizeHeight}
							>
								Apply Resize
							</Button>
						</div>
					)}
				</div>
			)}

			{/* Export Format + Quality */}
			<div className="p-4 border-b border-border">
				{sectionHeader('export', 'Export')}
				{!collapsed.export && (
					<div className="mt-3">
						<div className="flex gap-1.5 mb-3">
							{FORMAT_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() => setExportFormat(opt.value)}
									className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
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
								onChange={(e) => setExportQuality(Number((e.target as HTMLInputElement).value))}
							/>
						)}
						{estSize != null && (
							<p className="mt-2 text-[10px] text-text-tertiary">Est. {formatFileSize(estSize)}</p>
						)}
					</div>
				)}
			</div>

			{/* Actions */}
			<div className="p-4 border-t border-border flex flex-col gap-2 mt-auto">
				{originalData && (
					<Button
						variant="ghost"
						size="sm"
						className="w-full"
						onPointerDown={() => setShowOriginal(true)}
						onPointerUp={() => setShowOriginal(false)}
						onPointerLeave={() => setShowOriginal(false)}
					>
						Hold to Compare
					</Button>
				)}

				<Button className="w-full" disabled={!originalData} onClick={handleExport}>
					Export
				</Button>
			</div>

			{/* Info modal */}
			{showInfo && file && originalData && (
				<ImageInfoModal
					file={file}
					width={originalData.width}
					height={originalData.height}
					onClose={() => setShowInfo(false)}
				/>
			)}
		</aside>
	);
}
