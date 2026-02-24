import { useCallback, useId, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/index.ts';
import { useGifEditorStore } from '@/stores/gifEditor.ts';

export function GifImageOverlayPanel() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const xId = useId();
	const yId = useId();
	const wId = useId();
	const hId = useId();
	const opacityId = useId();

	const { overlay, setImageOverlay, clearImageOverlay } = useGifEditorStore(
		useShallow((s) => ({
			overlay: s.imageOverlay,
			setImageOverlay: s.setImageOverlay,
			clearImageOverlay: s.clearImageOverlay,
		})),
	);

	const handleFile = useCallback(
		(file: File | undefined) => {
			if (!file || !file.type.startsWith('image/')) return;
			const url = URL.createObjectURL(file);

			const img = new Image();
			img.onload = () => {
				setImageOverlay({ file, url, width: img.naturalWidth, height: img.naturalHeight });
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
			};
			img.src = url;
		},
		[setImageOverlay],
	);

	return (
		<>
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					Image Overlay
				</h3>
				<p className="text-[12px] text-text-tertiary mb-3">
					Upload an image to overlay on all frames of the GIF (watermark, logo, sticker).
				</p>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
					className="hidden"
					onChange={(e) => {
						handleFile(e.target.files?.[0]);
						e.target.value = '';
					}}
				/>
				<Button
					variant="secondary"
					className="w-full"
					onClick={() => {
						fileInputRef.current?.click();
					}}
				>
					{overlay.url ? 'Replace Image' : 'Choose Image'}
				</Button>
			</div>

			{overlay.url && (
				<>
					{/* Preview */}
					<div className="rounded-lg bg-bg/50 p-2 flex items-center justify-center">
						<img
							src={overlay.url}
							alt="Overlay preview"
							className="max-w-full max-h-24 rounded object-contain"
							style={{ opacity: overlay.opacity }}
						/>
					</div>

					{/* Position */}
					<div>
						<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
							Position
						</h3>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label htmlFor={xId} className="text-[12px] text-text-tertiary block mb-1">
									X
								</label>
								<input
									id={xId}
									type="number"
									value={overlay.x}
									onChange={(e) => {
										setImageOverlay({ x: Number(e.target.value) });
									}}
									className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
							<div>
								<label htmlFor={yId} className="text-[12px] text-text-tertiary block mb-1">
									Y
								</label>
								<input
									id={yId}
									type="number"
									value={overlay.y}
									onChange={(e) => {
										setImageOverlay({ y: Number(e.target.value) });
									}}
									className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
						</div>

						{/* Quick position presets */}
						<div className="flex flex-wrap gap-1.5 mt-2">
							{[
								{ label: 'Top-Left', x: 0, y: 0 },
								{ label: 'Top-Right', x: -1, y: 0 },
								{ label: 'Center', x: -2, y: -2 },
								{ label: 'Bottom-Left', x: 0, y: -1 },
								{ label: 'Bottom-Right', x: -1, y: -1 },
							].map((p) => (
								<button
									key={p.label}
									onClick={() => {
										setImageOverlay({ x: p.x, y: p.y });
									}}
									className="px-2 py-1 rounded text-[11px] font-medium text-text-tertiary bg-surface-raised/50 hover:bg-surface-raised border border-border/50 cursor-pointer transition-colors"
								>
									{p.label}
								</button>
							))}
						</div>
						<p className="text-[11px] text-text-tertiary mt-1.5">
							Use -1 for right/bottom edge, -2 for center
						</p>
					</div>

					{/* Size */}
					<div>
						<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
							Size
						</h3>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label htmlFor={wId} className="text-[12px] text-text-tertiary block mb-1">
									Width
								</label>
								<input
									id={wId}
									type="number"
									min={1}
									max={4096}
									value={overlay.width}
									onChange={(e) => {
										setImageOverlay({ width: Math.max(1, Number(e.target.value)) });
									}}
									className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
							<div>
								<label htmlFor={hId} className="text-[12px] text-text-tertiary block mb-1">
									Height
								</label>
								<input
									id={hId}
									type="number"
									min={1}
									max={4096}
									value={overlay.height}
									onChange={(e) => {
										setImageOverlay({ height: Math.max(1, Number(e.target.value)) });
									}}
									className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
								/>
							</div>
						</div>
					</div>

					{/* Opacity */}
					<div>
						<label htmlFor={opacityId} className="text-[14px] font-medium text-text-secondary mb-1.5 block">
							Opacity — {Math.round(overlay.opacity * 100)}%
						</label>
						<input
							id={opacityId}
							type="range"
							min={0}
							max={1}
							step={0.05}
							value={overlay.opacity}
							onChange={(e) => {
								setImageOverlay({ opacity: Number(e.target.value) });
							}}
							className="w-full accent-accent"
						/>
					</div>

					{/* Remove */}
					<Button variant="danger" size="sm" onClick={clearImageOverlay}>
						Remove Overlay
					</Button>
				</>
			)}

			{!overlay.url && (
				<p className="text-[14px] text-text-tertiary/60 text-center py-6">
					Upload an image to use as a watermark or overlay
				</p>
			)}
		</>
	);
}
