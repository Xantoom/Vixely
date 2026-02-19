import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Slider } from '@/components/ui/index.ts';
import {
	VIDEO_CODECS,
	CONTAINERS,
	AUDIO_CODECS,
	AUDIO_BITRATES,
	isValidCombo,
	isValidAudioCombo,
} from '@/config/codecs.ts';

export type VideoRateControlMode = 'crf' | 'bitrate' | 'qp';

export interface AdvancedVideoSettings {
	codec: string;
	container: string;
	rateControl: VideoRateControlMode;
	crf: number;
	targetBitrateKbps: number;
	qp: number;
	preset: string;
	audioCodec: string;
	audioBitrate: string;
}

export const DEFAULT_ADVANCED: AdvancedVideoSettings = {
	codec: 'libx264',
	container: 'mp4',
	rateControl: 'crf',
	crf: 23,
	targetBitrateKbps: 2500,
	qp: 28,
	preset: 'veryfast',
	audioCodec: 'aac',
	audioBitrate: '96k',
};

function codecSupportsQp(codec: string): boolean {
	return codec === 'libx264' || codec === 'libx265';
}

interface AdvancedSettingsProps {
	settings: AdvancedVideoSettings;
	onChange: (settings: AdvancedVideoSettings) => void;
	defaultExpanded?: boolean;
	hasAudio?: boolean;
}

export function AdvancedSettings({
	settings,
	onChange,
	defaultExpanded = false,
	hasAudio = true,
}: AdvancedSettingsProps) {
	const [expanded, setExpanded] = useState(defaultExpanded);

	const update = <K extends keyof AdvancedVideoSettings>(key: K, value: AdvancedVideoSettings[K]) => {
		const next = { ...settings, [key]: value };

		// Auto-fix invalid combos
		if (key === 'codec' && typeof value === 'string' && !isValidCombo(value, next.container)) {
			const codec = VIDEO_CODECS.find((c) => c.ffmpegLib === value);
			if (codec) next.container = codec.containers[0]!;
		}
		if (key === 'container' && typeof value === 'string' && !isValidCombo(next.codec, value)) {
			const validCodec = VIDEO_CODECS.find((c) => c.containers.includes(value));
			if (validCodec) next.codec = validCodec.ffmpegLib;
		}
		if (key === 'container' && typeof value === 'string' && !isValidAudioCombo(next.audioCodec, value)) {
			const validAudio = AUDIO_CODECS.find((c) => c.ffmpegLib !== 'none' && c.containers.includes(value));
			if (validAudio) next.audioCodec = validAudio.ffmpegLib;
		}
		if (!codecSupportsQp(next.codec) && next.rateControl === 'qp') {
			next.rateControl = 'crf';
		}

		onChange(next);
	};

	return (
		<div className="flex flex-col">
			<button
				onClick={() => {
					setExpanded(!expanded);
				}}
				className="flex items-center gap-2 text-sm font-semibold text-text-tertiary uppercase tracking-wider cursor-pointer hover:text-text-secondary transition-colors w-full"
			>
				<ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
				Advanced Encoding
			</button>

			{expanded && (
				<div className="mt-3 flex flex-col gap-4">
					{/* Codec */}
					<div>
						<label className="text-[14px] text-text-tertiary mb-1.5 block">Video Codec</label>
						<div className="grid grid-cols-2 gap-1">
							{VIDEO_CODECS.map((c) => (
								<button
									key={c.ffmpegLib}
									onClick={() => {
										update('codec', c.ffmpegLib);
									}}
									className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
										settings.codec === c.ffmpegLib
											? 'bg-accent/15 text-accent border border-accent/30'
											: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
									}`}
								>
									{c.name}
								</button>
							))}
						</div>
					</div>

					{/* Container */}
					<div>
						<label className="text-[14px] text-text-tertiary mb-1.5 block">Container</label>
						<div className="flex gap-1">
							{CONTAINERS.map((c) => {
								const valid = isValidCombo(settings.codec, c.ext);
								return (
									<button
										key={c.ext}
										onClick={() => {
											update('container', c.ext);
										}}
										disabled={!valid}
										className={`flex-1 rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
											settings.container === c.ext
												? 'bg-accent/15 text-accent border border-accent/30'
												: valid
													? 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
													: 'bg-surface-raised/30 text-text-tertiary/30 border border-transparent cursor-not-allowed'
										}`}
									>
										{c.name}
									</button>
								);
							})}
						</div>
					</div>

					<div>
						<label className="mb-1.5 block text-[14px] text-text-tertiary">Rate Control</label>
						<div className="grid grid-cols-3 gap-1">
							<button
								onClick={() => {
									update('rateControl', 'crf');
								}}
								className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
									settings.rateControl === 'crf'
										? 'bg-accent/15 text-accent border border-accent/30'
										: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
								}`}
							>
								CRF
							</button>
							<button
								onClick={() => {
									update('rateControl', 'bitrate');
								}}
								className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
									settings.rateControl === 'bitrate'
										? 'bg-accent/15 text-accent border border-accent/30'
										: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
								}`}
							>
								Bitrate
							</button>
							<button
								onClick={() => {
									update('rateControl', 'qp');
								}}
								disabled={!codecSupportsQp(settings.codec)}
								className={`rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
									settings.rateControl === 'qp'
										? 'bg-accent/15 text-accent border border-accent/30'
										: codecSupportsQp(settings.codec)
											? 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
											: 'bg-surface-raised/30 text-text-tertiary/30 border border-transparent cursor-not-allowed'
								}`}
							>
								QP
							</button>
						</div>
					</div>

					{settings.rateControl === 'crf' && (
						<>
							<Slider
								label="Quality (CRF)"
								displayValue={`${settings.crf}`}
								min={10}
								max={45}
								step={1}
								value={settings.crf}
								onChange={(e) => {
									update('crf', Number((e.target as HTMLInputElement).value));
								}}
							/>
							<div className="flex justify-between text-[14px] text-text-tertiary -mt-2">
								<span>Higher quality</span>
								<span>Smaller file</span>
							</div>
						</>
					)}
					{settings.rateControl === 'bitrate' && (
						<>
							<Slider
								label="Target Bitrate"
								displayValue={`${settings.targetBitrateKbps} kb/s`}
								min={150}
								max={20000}
								step={50}
								value={settings.targetBitrateKbps}
								onChange={(e) => {
									update('targetBitrateKbps', Number((e.target as HTMLInputElement).value));
								}}
							/>
							<div className="flex justify-between text-[14px] text-text-tertiary -mt-2">
								<span>Smaller file</span>
								<span>Higher quality</span>
							</div>
						</>
					)}
					{settings.rateControl === 'qp' && (
						<>
							<Slider
								label="Constant QP"
								displayValue={`${settings.qp}`}
								min={0}
								max={51}
								step={1}
								value={settings.qp}
								onChange={(e) => {
									update('qp', Number((e.target as HTMLInputElement).value));
								}}
							/>
							<div className="flex justify-between text-[14px] text-text-tertiary -mt-2">
								<span>Higher quality</span>
								<span>Smaller file</span>
							</div>
						</>
					)}

					{hasAudio && (
						<>
							{/* Audio Codec */}
							<div>
								<label className="text-[14px] text-text-tertiary mb-1.5 block">Audio Codec</label>
								<div className="flex gap-1">
									{AUDIO_CODECS.map((c) => {
										const valid = isValidAudioCombo(c.ffmpegLib, settings.container);
										return (
											<button
												key={c.ffmpegLib}
												onClick={() => {
													update('audioCodec', c.ffmpegLib);
												}}
												disabled={!valid}
												className={`flex-1 rounded-md py-1.5 text-[14px] font-medium transition-all cursor-pointer ${
													settings.audioCodec === c.ffmpegLib
														? 'bg-accent/15 text-accent border border-accent/30'
														: valid
															? 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
															: 'bg-surface-raised/30 text-text-tertiary/30 border border-transparent cursor-not-allowed'
												}`}
											>
												{c.name}
											</button>
										);
									})}
								</div>
							</div>

							{/* Audio Bitrate */}
							{settings.audioCodec !== 'none' && (
								<div>
									<label className="text-[14px] text-text-tertiary mb-1.5 block">Audio Bitrate</label>
									<div className="grid grid-cols-3 gap-1">
										{AUDIO_BITRATES.map((b) => (
											<button
												key={b.value}
												onClick={() => {
													update('audioBitrate', b.value);
												}}
												className={`rounded-md py-1 text-[14px] font-medium transition-all cursor-pointer ${
													settings.audioBitrate === b.value
														? 'bg-accent/15 text-accent border border-accent/30'
														: 'bg-surface-raised/60 text-text-tertiary border border-transparent hover:bg-surface-raised'
												}`}
											>
												{b.label}
											</button>
										))}
									</div>
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
