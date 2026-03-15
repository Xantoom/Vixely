import { Check, X } from 'lucide-react';
import { useMemo } from 'react';
import {
	getPlatformIcon,
	getPlatformKey,
	getPlatformLabel,
	PlatformIconComponent,
} from '@/components/video/PlatformIcons.tsx';

export interface PresetEntry {
	key: string;
	name: string;
	subtitle: string;
}

interface SharedPresetsPanelProps {
	presets: PresetEntry[];
	selectedPreset: string | null;
	onSelectPreset: (key: string | null) => void;
	emptyLabel?: string;
	fallbackIconLetter?: string;
}

function groupByPlatform(presets: PresetEntry[]) {
	const groups: Record<string, PresetEntry[]> = {};
	for (const entry of presets) {
		const platform = getPlatformKey(entry.key);
		if (!groups[platform]) groups[platform] = [];
		groups[platform].push(entry);
	}
	const order = ['discord', 'twitch', 'youtube', 'twitter', 'tiktok', 'bluesky', 'general'];
	return order.filter((p) => groups[p]).map((p) => ({ platform: p, presets: groups[p]! }));
}

export function SharedPresetsPanel({
	presets,
	selectedPreset,
	onSelectPreset,
	emptyLabel = 'Pick a preset for your target platform.',
	fallbackIconLetter = 'P',
}: SharedPresetsPanelProps) {
	const groupedPresets = useMemo(() => groupByPlatform(presets), [presets]);

	const selectedEntry = useMemo(
		() => (selectedPreset ? presets.find((p) => p.key === selectedPreset) : null),
		[presets, selectedPreset],
	);

	return (
		<div className="flex flex-col gap-3">
			{/* Selected preset summary */}
			{selectedEntry ? (
				<div className="flex items-start gap-2.5 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2">
					<div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent">
						<Check size={11} className="text-bg" strokeWidth={2.5} />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[13px] font-semibold text-accent">{selectedEntry.name}</p>
						<p className="truncate text-[11px] text-accent/60">{selectedEntry.subtitle}</p>
					</div>
					<button
						onClick={() => {
							onSelectPreset(null);
						}}
						className="mt-0.5 shrink-0 cursor-pointer text-accent/50 transition-colors hover:text-accent"
						aria-label="Clear preset"
					>
						<X size={14} />
					</button>
				</div>
			) : (
				<p className="text-[12px] text-text-tertiary">{emptyLabel}</p>
			)}

			{/* Platform groups */}
			<div className="flex flex-col gap-3">
				{groupedPresets.map(({ platform, presets: platformPresets }) => (
					<div key={platform}>
						<div className="mb-1.5 flex items-center gap-1.5">
							<PlatformIconComponent
								platform={platform}
								size={11}
								className="shrink-0 text-text-tertiary"
							/>
							<span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
								{getPlatformLabel(platform)}
							</span>
						</div>

						<div className="flex flex-col gap-0.5">
							{platformPresets.map((preset) => {
								const iconData = getPlatformIcon(preset.key);
								const isSelected = selectedPreset === preset.key;

								return (
									<button
										key={preset.key}
										onClick={() => {
											onSelectPreset(isSelected ? null : preset.key);
										}}
										className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all ${
											isSelected
												? 'border-accent/30 bg-accent/8 text-text'
												: 'border-transparent bg-surface-raised/40 text-text-secondary hover:border-border/60 hover:bg-surface-raised hover:text-text'
										}`}
									>
										<div
											className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
												isSelected
													? 'bg-accent text-bg'
													: 'bg-surface-raised text-text-tertiary group-hover:bg-surface-raised'
											}`}
										>
											{iconData ? (
												<iconData.Icon
													size={12}
													className={isSelected ? 'text-bg' : iconData.colorClass}
												/>
											) : (
												<span className="text-[9px] font-bold">{fallbackIconLetter}</span>
											)}
										</div>

										<div className="min-w-0 flex-1">
											<p className="truncate text-[12px] font-medium leading-snug">
												{preset.name}
											</p>
											<p className="truncate text-[11px] text-text-tertiary">{preset.subtitle}</p>
										</div>

										{isSelected && <Check size={13} className="shrink-0 text-accent" />}
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
