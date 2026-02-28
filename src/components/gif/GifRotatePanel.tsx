import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/index.ts';
import { useGifEditorStore, type RotationAngle } from '@/stores/gifEditor.ts';

const ROTATION_PRESETS: { label: string; icon: typeof RotateCw; value: RotationAngle }[] = [
	{ label: '0°', icon: RotateCw, value: 0 },
	{ label: '90°', icon: RotateCw, value: 90 },
	{ label: '180°', icon: RotateCw, value: 180 },
	{ label: '270°', icon: RotateCcw, value: 270 },
];

const ROTATE_RIGHT: Record<RotationAngle, RotationAngle> = { 0: 90, 90: 180, 180: 270, 270: 0 };
const ROTATE_LEFT: Record<RotationAngle, RotationAngle> = { 0: 270, 90: 0, 180: 90, 270: 180 };

export function GifRotatePanel() {
	const { rotation, flipH, flipV, setRotation, setFlipH, setFlipV } = useGifEditorStore(
		useShallow((s) => ({
			rotation: s.rotation,
			flipH: s.flipH,
			flipV: s.flipV,
			setRotation: s.setRotation,
			setFlipH: s.setFlipH,
			setFlipV: s.setFlipV,
		})),
	);

	const hasChanges = rotation !== 0 || flipH || flipV;

	return (
		<>
			{/* Rotation */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">Rotate</h3>
				<div className="grid grid-cols-4 gap-1.5">
					{ROTATION_PRESETS.map((preset) => (
						<button
							key={preset.value}
							onClick={() => {
								setRotation(preset.value);
							}}
							className={`flex flex-col items-center gap-1 rounded-lg py-2.5 text-[14px] font-medium transition-all cursor-pointer ${
								rotation === preset.value
									? 'bg-accent/15 text-accent border border-accent/30'
									: 'bg-surface-raised/50 text-text-tertiary border border-transparent hover:bg-surface-raised hover:text-text'
							}`}
						>
							<preset.icon size={18} />
							{preset.label}
						</button>
					))}
				</div>
			</div>

			{/* Quick rotate buttons */}
			<div className="flex gap-2">
				<Button
					variant="secondary"
					size="sm"
					className="flex-1"
					onClick={() => {
						setRotation(ROTATE_RIGHT[rotation]);
					}}
				>
					<RotateCw size={14} />
					Rotate Right
				</Button>
				<Button
					variant="secondary"
					size="sm"
					className="flex-1"
					onClick={() => {
						setRotation(ROTATE_LEFT[rotation]);
					}}
				>
					<RotateCcw size={14} />
					Rotate Left
				</Button>
			</div>

			{/* Flip */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">Flip</h3>
				<div className="grid grid-cols-2 gap-1.5">
					<button
						onClick={() => {
							setFlipH(!flipH);
						}}
						className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-medium transition-all cursor-pointer ${
							flipH
								? 'bg-accent/15 text-accent border border-accent/30'
								: 'bg-surface-raised/50 text-text-tertiary border border-transparent hover:bg-surface-raised hover:text-text'
						}`}
					>
						<FlipHorizontal size={16} />
						Horizontal
					</button>
					<button
						onClick={() => {
							setFlipV(!flipV);
						}}
						className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-medium transition-all cursor-pointer ${
							flipV
								? 'bg-accent/15 text-accent border border-accent/30'
								: 'bg-surface-raised/50 text-text-tertiary border border-transparent hover:bg-surface-raised hover:text-text'
						}`}
					>
						<FlipVertical size={16} />
						Vertical
					</button>
				</div>
			</div>

			{/* Reset */}
			{hasChanges && (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						setRotation(0);
						setFlipH(false);
						setFlipV(false);
					}}
				>
					Reset Transform
				</Button>
			)}

			<p className="text-[14px] text-text-tertiary">
				Transforms are applied during GIF generation. The preview shows the source orientation.
			</p>
		</>
	);
}
