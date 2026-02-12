import { Lock, Unlock, Info, FilePlus2, Palette, SlidersHorizontal, Maximize2, Download } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { MonetagAd } from '@/components/AdContainer.tsx';
import { Button, Slider } from '@/components/ui/index.ts';
import { MONETAG_ZONES } from '@/config/monetag.ts';
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

/* ── Mode Tab Config ── */

type ImageMode = 'resize' | 'adjust' | 'presets' | 'export';

const IMAGE_MODE_TABS: { mode: ImageMode; label: string; icon: typeof Palette }[] = [
	{ mode: 'resize', label: 'Resize', icon: Maximize2 },
	{ mode: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
	{ mode: 'presets', label: 'Presets', icon: Palette },
	{ mode: 'export', label: 'Export', icon: Download },
];

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

	const [mode, setMode] = useState<ImageMode>('resize');
	const [showInfo, setShowInfo] = useState(false);

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

	const renderSliders = (sliders: SliderDef[]) => (
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
					onChange={(e) => setFilter(s.key, Number((e.target as HTMLInputElement).value))}
					onPointerDown={handleSliderDown}
					onCommit={handleSliderCommit}
				/>
			))}
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
			className="w-72 xl:w-80 shrink-0 min-h-0 overflow-hidden border-l border-border bg-surface flex flex-col"
			style={{ overscrollBehavior: 'contain' }}
		>
			{/* Mode Tabs */}
			<div className="flex border-b border-border bg-surface overflow-x-auto shrink-0">
				{IMAGE_MODE_TABS.map((tab) => {
					const isActive = mode === tab.mode;
					return (
						<button
							key={tab.mode}
							onClick={() => setMode(tab.mode)}
							className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
								isActive
									? 'text-accent border-b-2 border-accent'
									: 'text-text-tertiary hover:text-text-secondary'
							}`}
						>
							<tab.icon size={16} />
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* File */}
			<div className="p-4 border-b border-border shrink-0">
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
						<p className="text-[13px] text-text-tertiary flex-1">{formatFileSize(file.size)}</p>
						<button
							onClick={() => setShowInfo(true)}
							className="h-5 w-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
							title="File info"
						>
							<Info size={12} />
						</button>
					</div>
				)}
				{!wasmReady && <p className="mt-1.5 text-[13px] text-accent animate-pulse-soft">Loading engine...</p>}
			</div>

			{/* Tab Content */}
			<div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
				{mode === 'resize' && (
					<>
						{originalData ? (
							<>
								<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">
									Dimensions
								</h3>
								<div className="flex flex-wrap gap-1">
									{IMAGE_PRESETS.map(([key, preset]) => (
										<button
											key={key}
											onClick={() => handleApplyPreset(key)}
											className="rounded-md bg-surface-raised/60 px-2 py-1 text-[11px] font-medium text-text-tertiary hover:bg-surface-raised hover:text-text transition-all cursor-pointer"
											title={preset.description}
										>
											{preset.name}
										</button>
									))}
								</div>

								<div className="flex items-center gap-2">
									<div className="flex-1">
										<label className="text-[12px] text-text-tertiary mb-1 block">W</label>
										<input
											type="number"
											min={1}
											max={8192}
											value={resizeWidth ?? ''}
											onChange={(e) =>
												setResizeWidth(e.target.value ? Number(e.target.value) : null)
											}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
										/>
									</div>
									<button
										onClick={() => setResizeLockAspect(!resizeLockAspect)}
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
										<label className="text-[12px] text-text-tertiary mb-1 block">H</label>
										<input
											type="number"
											min={1}
											max={8192}
											value={resizeHeight ?? ''}
											onChange={(e) =>
												setResizeHeight(e.target.value ? Number(e.target.value) : null)
											}
											className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-xs font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
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
							<p className="text-xs text-text-tertiary">Load an image to resize.</p>
						)}
					</>
				)}

				{mode === 'adjust' && (
					<>
						<div className="flex items-center justify-between">
							<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">
								Light
							</h3>
							<button
								onClick={resetFilters}
								className="text-[12px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
							>
								Reset
							</button>
						</div>
						{renderSliders(LIGHT_SLIDERS)}

						<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider mt-2">
							Color
						</h3>
						{renderSliders(COLOR_SLIDERS)}

						<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider mt-2">
							Effects
						</h3>
						{renderSliders(EFFECTS_SLIDERS)}
					</>
				)}

				{mode === 'presets' && (
					<>
						<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">
							Color Presets
						</h3>
						<div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
							{FILTER_PRESETS.map(([key, preset]) => (
								<button
									key={key}
									onClick={() => applyFilterPreset(preset, processFn)}
									className="rounded-md bg-surface-raised/60 py-2 text-[12px] font-medium text-text-tertiary hover:bg-surface-raised hover:text-text transition-all cursor-pointer"
								>
									{preset.name}
								</button>
							))}
						</div>
					</>
				)}

				{mode === 'export' && (
					<>
						<h3 className="text-[13px] font-semibold text-text-tertiary uppercase tracking-wider">
							Format
						</h3>
						<div className="flex gap-1.5">
							{FORMAT_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() => setExportFormat(opt.value)}
									className={`flex-1 rounded-md py-1.5 text-[13px] font-medium transition-all cursor-pointer ${
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
							<p className="text-[12px] text-text-tertiary">Est. {formatFileSize(estSize)}</p>
						)}
					</>
				)}
			</div>

			{/* Actions (always visible at bottom) */}
			<div className="p-4 border-t border-border flex flex-col gap-2 shrink-0">
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

				{originalData && <MonetagAd zoneId={MONETAG_ZONES.export} className="mt-1" />}
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
