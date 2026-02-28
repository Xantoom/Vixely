import { Plus, Trash2, Type } from 'lucide-react';
import { useCallback, useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button, Slider } from '@/components/ui/index.ts';
import { useGifEditorStore, type TextOverlay } from '@/stores/gifEditor.ts';

const FONT_FAMILIES = [
	'Arial',
	'Helvetica',
	'Georgia',
	'Times New Roman',
	'Courier New',
	'Verdana',
	'Impact',
	'Comic Sans MS',
	'Trebuchet MS',
	'Palatino',
];

const PRESET_COLORS = [
	'#ffffff',
	'#000000',
	'#ff0000',
	'#00ff00',
	'#0000ff',
	'#ffff00',
	'#ff00ff',
	'#00ffff',
	'#ff6600',
	'#9900ff',
];

let overlayIdCounter = 0;

function createOverlayId(): string {
	overlayIdCounter += 1;
	return `text-${Date.now()}-${overlayIdCounter}`;
}

export function GifTextOverlayPanel() {
	const { textOverlays, activeOverlayId, addTextOverlay, removeTextOverlay, setActiveOverlayId } = useGifEditorStore(
		useShallow((s) => ({
			textOverlays: s.textOverlays,
			activeOverlayId: s.activeOverlayId,
			addTextOverlay: s.addTextOverlay,
			updateTextOverlay: s.updateTextOverlay,
			removeTextOverlay: s.removeTextOverlay,
			setActiveOverlayId: s.setActiveOverlayId,
		})),
	);

	const handleAddOverlay = useCallback(() => {
		const overlay: TextOverlay = {
			id: createOverlayId(),
			text: 'Text',
			x: 50,
			y: 50,
			fontSize: 24,
			fontFamily: 'Arial',
			color: '#ffffff',
			outlineColor: '#000000',
			outlineWidth: 2,
			opacity: 1,
		};
		addTextOverlay(overlay);
	}, [addTextOverlay]);

	const activeOverlay = textOverlays.find((o) => o.id === activeOverlayId);

	return (
		<>
			{/* Add button */}
			<Button variant="secondary" size="sm" className="w-full" onClick={handleAddOverlay}>
				<Plus size={14} />
				Add Text
			</Button>

			{/* Overlay list */}
			{textOverlays.length > 0 && (
				<div className="flex flex-col gap-1">
					{textOverlays.map((overlay) => (
						<div
							key={overlay.id}
							className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all cursor-pointer ${
								activeOverlayId === overlay.id
									? 'bg-accent/10 border border-accent/30'
									: 'bg-surface-raised/30 border border-transparent hover:bg-surface-raised/60'
							}`}
							onClick={() => {
								setActiveOverlayId(overlay.id);
							}}
						>
							<Type size={14} className="text-text-tertiary shrink-0" />
							<span className="text-[14px] text-text-secondary flex-1 truncate">
								{overlay.text || 'Empty text'}
							</span>
							<button
								className="shrink-0 text-text-tertiary hover:text-danger cursor-pointer"
								onClick={(e) => {
									e.stopPropagation();
									removeTextOverlay(overlay.id);
								}}
								title="Remove text"
							>
								<Trash2 size={12} />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Editor for active overlay */}
			{activeOverlay && <TextOverlayEditor overlay={activeOverlay} />}

			{textOverlays.length === 0 && (
				<p className="text-[14px] text-text-tertiary">
					Add text overlays to your GIF. Each overlay can have its own font, color, size, and position. Text
					is rendered onto frames during generation.
				</p>
			)}
		</>
	);
}

function TextOverlayEditor({ overlay }: { overlay: TextOverlay }) {
	const { updateTextOverlay } = useGifEditorStore(useShallow((s) => ({ updateTextOverlay: s.updateTextOverlay })));

	const textId = useId();
	const xId = useId();
	const yId = useId();

	const update = useCallback(
		(updates: Partial<TextOverlay>) => {
			updateTextOverlay(overlay.id, updates);
		},
		[overlay.id, updateTextOverlay],
	);

	return (
		<div className="flex flex-col gap-3 rounded-lg bg-bg/50 p-3">
			{/* Text content */}
			<div>
				<label htmlFor={textId} className="text-[14px] font-medium text-text-secondary mb-1 block">
					Text
				</label>
				<input
					id={textId}
					type="text"
					value={overlay.text}
					onChange={(e) => {
						update({ text: e.target.value });
					}}
					className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] text-text focus:outline-none focus:border-accent/50"
					placeholder="Enter text..."
				/>
			</div>

			{/* Font */}
			<div>
				<label className="text-[14px] font-medium text-text-secondary mb-1 block">Font</label>
				<select
					value={overlay.fontFamily}
					onChange={(e) => {
						update({ fontFamily: e.target.value });
					}}
					className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] text-text focus:outline-none focus:border-accent/50"
				>
					{FONT_FAMILIES.map((font) => (
						<option key={font} value={font} style={{ fontFamily: font }}>
							{font}
						</option>
					))}
				</select>
			</div>

			{/* Font Size */}
			<Slider
				label="Size"
				displayValue={`${overlay.fontSize}px`}
				min={8}
				max={120}
				step={1}
				value={overlay.fontSize}
				onChange={(e) => {
					update({ fontSize: Number(e.target.value) });
				}}
			/>

			{/* Position */}
			<div className="grid grid-cols-2 gap-2">
				<div>
					<label htmlFor={xId} className="text-[14px] text-text-tertiary mb-1 block">
						X (%)
					</label>
					<input
						id={xId}
						type="number"
						min={0}
						max={100}
						value={Math.round(overlay.x)}
						onChange={(e) => {
							update({ x: Math.max(0, Math.min(100, Number(e.target.value))) });
						}}
						className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
					/>
				</div>
				<div>
					<label htmlFor={yId} className="text-[14px] text-text-tertiary mb-1 block">
						Y (%)
					</label>
					<input
						id={yId}
						type="number"
						min={0}
						max={100}
						value={Math.round(overlay.y)}
						onChange={(e) => {
							update({ y: Math.max(0, Math.min(100, Number(e.target.value))) });
						}}
						className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
					/>
				</div>
			</div>

			{/* Colors */}
			<div>
				<label className="text-[14px] font-medium text-text-secondary mb-1.5 block">Text Color</label>
				<div className="flex gap-1 flex-wrap">
					{PRESET_COLORS.map((color) => (
						<button
							key={color}
							onClick={() => {
								update({ color });
							}}
							className={`w-6 h-6 rounded cursor-pointer border ${
								overlay.color === color ? 'border-accent scale-110' : 'border-border/50'
							}`}
							style={{ backgroundColor: color }}
							title={color}
						/>
					))}
				</div>
			</div>

			<div>
				<label className="text-[14px] font-medium text-text-secondary mb-1.5 block">Outline Color</label>
				<div className="flex gap-1 flex-wrap">
					{PRESET_COLORS.map((color) => (
						<button
							key={color}
							onClick={() => {
								update({ outlineColor: color });
							}}
							className={`w-6 h-6 rounded cursor-pointer border ${
								overlay.outlineColor === color ? 'border-accent scale-110' : 'border-border/50'
							}`}
							style={{ backgroundColor: color }}
							title={color}
						/>
					))}
				</div>
			</div>

			{/* Outline width */}
			<Slider
				label="Outline"
				displayValue={`${overlay.outlineWidth}px`}
				min={0}
				max={10}
				step={1}
				value={overlay.outlineWidth}
				onChange={(e) => {
					update({ outlineWidth: Number(e.target.value) });
				}}
			/>

			{/* Opacity */}
			<Slider
				label="Opacity"
				displayValue={`${Math.round(overlay.opacity * 100)}%`}
				min={0}
				max={1}
				step={0.05}
				value={overlay.opacity}
				onChange={(e) => {
					update({ opacity: Number(e.target.value) });
				}}
			/>
		</div>
	);
}
