import { Lock, Unlock } from 'lucide-react';
import { useCallback, useId } from 'react';
import { Slider } from '@/components/ui/index.ts';
import { formatNumber } from '@/utils/format.ts';

interface GifResizePanelProps {
	width: number;
	height: number | null;
	lockAspect: boolean;
	sourceAspect: number;
	onWidthChange: (w: number) => void;
	onHeightChange: (h: number) => void;
	onLockAspectChange: (lock: boolean) => void;
}

const COMMON_SIZES = [
	{ label: '320', w: 320 },
	{ label: '480', w: 480 },
	{ label: '640', w: 640 },
	{ label: '720', w: 720 },
	{ label: '1080', w: 1080 },
	{ label: '1280', w: 1280 },
];

export function GifResizePanel({
	width,
	height,
	lockAspect,
	sourceAspect,
	onWidthChange,
	onHeightChange,
	onLockAspectChange,
}: GifResizePanelProps) {
	const widthId = useId();
	const heightId = useId();

	const handleWidthChange = useCallback(
		(w: number) => {
			onWidthChange(w);
			if (lockAspect) {
				onHeightChange(Math.round(w / sourceAspect));
			}
		},
		[lockAspect, sourceAspect, onWidthChange, onHeightChange],
	);

	return (
		<>
			{/* Width / Height */}
			<div>
				<h3 className="text-[14px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
					Dimensions
				</h3>
				<div className="flex items-center gap-2">
					<div className="flex-1">
						<label htmlFor={widthId} className="text-[14px] text-text-tertiary mb-1 block">
							Width
						</label>
						<input
							id={widthId}
							type="number"
							min={16}
							max={1920}
							value={width}
							onChange={(e) => {
								handleWidthChange(Math.max(16, Number(e.target.value)));
							}}
							className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
						/>
					</div>
					<button
						onClick={() => {
							onLockAspectChange(!lockAspect);
						}}
						type="button"
						aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
						title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
						className={`mt-4 h-8 w-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
							lockAspect ? 'text-accent bg-accent/10' : 'text-text-tertiary hover:text-text'
						}`}
					>
						{lockAspect ? <Lock size={12} /> : <Unlock size={12} />}
					</button>
					<div className="flex-1">
						<label htmlFor={heightId} className="text-[14px] text-text-tertiary mb-1 block">
							Height
						</label>
						<input
							id={heightId}
							type="number"
							min={16}
							max={1920}
							value={height ?? Math.round(width / sourceAspect)}
							onChange={(e) => {
								onHeightChange(Math.max(16, Number(e.target.value)));
							}}
							className="w-full h-8 px-2 rounded-md bg-surface-raised/60 border border-border text-[14px] font-mono text-text tabular-nums focus:outline-none focus:border-accent/50"
						/>
					</div>
				</div>
			</div>

			{/* Quick Size Slider */}
			<Slider
				label="Quick Size"
				displayValue={`${formatNumber(width)}px`}
				min={128}
				max={1280}
				step={16}
				value={width}
				onChange={(e) => {
					handleWidthChange(Number(e.target.value));
				}}
			/>

			{/* Common size presets */}
			<div>
				<label className="text-[14px] text-text-tertiary mb-2 block">Common Sizes</label>
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
					{COMMON_SIZES.map((s) => (
						<button
							key={s.w}
							onClick={() => {
								handleWidthChange(s.w);
							}}
							className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
								width === s.w
									? 'bg-accent/15 text-accent border border-accent/30'
									: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
							}`}
						>
							{s.label}px
						</button>
					))}
				</div>
			</div>
		</>
	);
}
