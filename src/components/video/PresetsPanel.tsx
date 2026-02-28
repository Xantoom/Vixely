import { Check, X } from 'lucide-react';
import { getPlatformIcon, getPlatformLabel, PlatformIconComponent } from '@/components/video/PlatformIcons.tsx';

interface Preset {
	name: string;
	description: string;
}

interface PresetsGroup {
	platform: string;
	presets: [string, Preset][];
}

interface PresetsPanelProps {
	groupedPresets: PresetsGroup[];
	selectedPreset: string | null;
	onSelectPreset: (key: string | null) => void;
}

export function PresetsPanel({ groupedPresets, selectedPreset, onSelectPreset }: PresetsPanelProps) {
	const selectedEntry = selectedPreset
		? groupedPresets.flatMap((g) => g.presets).find(([key]) => key === selectedPreset)
		: null;

	return (
		<div className="flex flex-col gap-4">
			{/* Selected preset summary */}
			{selectedEntry ? (
				<div className="flex items-start gap-2.5 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2.5">
					<div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent">
						<Check size={11} className="text-bg" strokeWidth={2.5} />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[13px] font-semibold text-accent">{selectedEntry[1].name}</p>
						<p className="truncate text-[12px] text-accent/60">{selectedEntry[1].description}</p>
					</div>
					<button
						onClick={() => {
							onSelectPreset(null);
						}}
						className="mt-0.5 shrink-0 cursor-pointer text-accent/50 transition-colors hover:text-accent"
						aria-label="Clear selected preset"
					>
						<X size={14} />
					</button>
				</div>
			) : (
				<p className="text-[13px] text-text-tertiary">
					Pick a preset optimized for your target platform, then export.
				</p>
			)}

			{/* Platform groups */}
			<div className="flex flex-col gap-4">
				{groupedPresets.map(({ platform, presets }) => (
					<div key={platform}>
						<div className="mb-2 flex items-center gap-1.5">
							<PlatformIconComponent
								platform={platform}
								size={12}
								className="shrink-0 text-text-tertiary"
							/>
							<span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
								{getPlatformLabel(platform)}
							</span>
						</div>

						<div className="flex flex-col gap-1">
							{presets.map(([key, preset]) => {
								const iconData = getPlatformIcon(key);
								const isSelected = selectedPreset === key;

								return (
									<button
										key={key}
										onClick={() => {
											onSelectPreset(isSelected ? null : key);
										}}
										className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
											isSelected
												? 'border-accent/30 bg-accent/8 text-text'
												: 'border-transparent bg-surface-raised/40 text-text-secondary hover:border-border/60 hover:bg-surface-raised hover:text-text'
										}`}
									>
										{/* Platform icon */}
										<div
											className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
												isSelected
													? 'bg-accent text-bg'
													: 'bg-surface-raised text-text-tertiary group-hover:bg-surface-raised'
											}`}
										>
											{iconData ? (
												<iconData.Icon
													size={13}
													className={isSelected ? 'text-bg' : iconData.colorClass}
												/>
											) : (
												<span className="text-[10px] font-bold">V</span>
											)}
										</div>

										{/* Preset info */}
										<div className="min-w-0 flex-1">
											<p className="truncate text-[13px] font-medium leading-snug">
												{preset.name}
											</p>
											<p className="truncate text-[12px] text-text-tertiary">
												{preset.description}
											</p>
										</div>

										{/* Check */}
										{isSelected && <Check size={14} className="shrink-0 text-accent" />}
									</button>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
