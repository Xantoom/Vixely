import type { AdvancedVideoSettings } from '@/components/video/AdvancedSettings.tsx';
import type { StreamInfo, TrackSelection } from '@/stores/videoEditor.ts';
import { buildVideoArgs } from '@/config/presets.ts';

const CONTAINER_AUDIO_CODECS: Record<string, Set<string>> = {
	webm: new Set(['libopus', 'opus', 'libvorbis', 'vorbis']),
	mp4: new Set(['aac', 'mp3', 'libmp3lame', 'libopus', 'opus', 'flac', 'ac3', 'eac3']),
	mkv: new Set([
		'aac',
		'mp3',
		'libmp3lame',
		'libopus',
		'opus',
		'flac',
		'ac3',
		'eac3',
		'dts',
		'truehd',
		'pcm_s16le',
		'pcm_s24le',
	]),
};

const AUDIO_CODEC_TO_LIB: Record<string, string> = { aac: 'aac', opus: 'libopus', libopus: 'libopus' };
const BITMAP_SUB_CODECS = new Set(['hdmv_pgs_subtitle', 'pgssub', 'dvd_subtitle', 'dvdsub']);

type TrackExportMode = 'all' | 'single';

interface AudioSelectionSummary {
	selectedAudioStreamsForExport: StreamInfo[];
	selectedAudioStreamCount: number;
	selectedSourceAudioCodecs: string[];
	selectedSourceAudioMaxBitrateKbps: number;
	selectedSourceAudioTotalBitrateKbps: number;
}

export interface BuildFfmpegExportPlanInput {
	file: File;
	preBurnedAssSourceFile: File | null;
	usePreBurnedAssSource: boolean;
	selectedPreset: string | null;
	advancedSettings: AdvancedVideoSettings;
	videoNoReencode: boolean;
	audioNoReencode: boolean;
	audioExportMode: TrackExportMode;
	subtitleExportMode: TrackExportMode;
	tracks: TrackSelection;
	audioStreams: StreamInfo[];
	subtitleStreams: StreamInfo[];
	resizeFilterArgs: string[];
	ffmpegFilterArgs: string[];
	trimStart: number;
	trimEnd: number;
	duration: number;
	minTrimDuration: number;
	videoFps: number;
	videoStreamInfo: StreamInfo | null;
	encodeThreads: string;
}

export interface FfmpegExportPlan {
	sourceFile: File;
	args: string[];
	outputName: string;
	ext: string;
	clipDuration: number;
	usingPreBurnedSource: boolean;
	includeAudio: boolean;
	includeSubtitleTracks: boolean;
	isCustomExport: boolean;
	selectedAudioStream?: StreamInfo;
	selectedSubtitleStream?: StreamInfo;
}

function codecSupportsQp(codec: string): boolean {
	return codec === 'libx264' || codec === 'libx265';
}

function summarizeAudioSelection(selectedAudioStreamsForExport: StreamInfo[]): AudioSelectionSummary {
	const selectedSourceAudioCodecs = selectedAudioStreamsForExport
		.map((stream) => {
			const source = stream.codec?.toLowerCase().trim() ?? '';
			return AUDIO_CODEC_TO_LIB[source] ?? source;
		})
		.filter(Boolean);

	const selectedSourceAudioMaxBitrateKbps = selectedAudioStreamsForExport.reduce((max, stream) => {
		const bitrate = stream.bitrate != null && Number.isFinite(stream.bitrate) ? Math.round(stream.bitrate) : 0;
		return Math.max(max, Math.max(0, bitrate));
	}, 0);
	const selectedSourceAudioTotalBitrateKbps = selectedAudioStreamsForExport.reduce((sum, stream) => {
		const bitrate = stream.bitrate != null && Number.isFinite(stream.bitrate) ? Math.round(stream.bitrate) : 0;
		return sum + Math.max(0, bitrate);
	}, 0);

	return {
		selectedAudioStreamsForExport,
		selectedAudioStreamCount: selectedAudioStreamsForExport.length,
		selectedSourceAudioCodecs,
		selectedSourceAudioMaxBitrateKbps,
		selectedSourceAudioTotalBitrateKbps,
	};
}

function isAudioContainerCompatible(container: string, sourceAudioCodecs: string[]): boolean {
	const supported = CONTAINER_AUDIO_CODECS[container];
	if (!supported) return true;
	return sourceAudioCodecs.every((codec) => supported.has(codec));
}

function appendPresetVideoArgsWithFilters(args: string[], presetArgs: string[], vfParts: string[]): void {
	const presetVfIdx = presetArgs.indexOf('-vf');
	if (presetVfIdx !== -1 && vfParts.length > 0) {
		const presetVf = presetArgs[presetVfIdx + 1]!;
		args.push('-vf', [presetVf, ...vfParts].join(','));
		for (let i = 0; i < presetArgs.length; i += 1) {
			if (i !== presetVfIdx && i !== presetVfIdx + 1) args.push(presetArgs[i]!);
		}
		return;
	}

	if (vfParts.length > 0) args.push('-vf', vfParts.join(','));
	args.push(...presetArgs);
}

export function buildFfmpegExportPlan(input: BuildFfmpegExportPlanInput): FfmpegExportPlan {
	const {
		file,
		preBurnedAssSourceFile,
		usePreBurnedAssSource,
		selectedPreset,
		advancedSettings,
		videoNoReencode,
		audioNoReencode,
		audioExportMode,
		subtitleExportMode,
		tracks,
		audioStreams,
		subtitleStreams,
		resizeFilterArgs,
		ffmpegFilterArgs,
		trimStart,
		trimEnd,
		duration,
		minTrimDuration,
		videoFps,
		videoStreamInfo,
		encodeThreads,
	} = input;

	const usingPreBurnedSource = usePreBurnedAssSource && preBurnedAssSourceFile != null;
	const sourceFile = usingPreBurnedSource ? preBurnedAssSourceFile : file;
	const isCustomExport = selectedPreset == null;

	const clipDuration = Math.max(trimEnd - trimStart, minTrimDuration);
	const trimEpsilon = Math.max(minTrimDuration * 0.5, 0.01);
	const hasTrimStart = trimStart > trimEpsilon;
	const hasTrimRange = duration > 0 && clipDuration < Math.max(duration - trimEpsilon, 0);

	const args: string[] = [];
	if (hasTrimStart) args.push('-ss', trimStart.toFixed(3));
	if (hasTrimRange) args.push('-t', clipDuration.toFixed(3));

	const selectedAudioStream =
		tracks.audioEnabled && audioExportMode === 'single' ? audioStreams[tracks.audioTrackIndex] : undefined;
	const selectedSubtitleStream =
		!usingPreBurnedSource && tracks.subtitleEnabled && subtitleExportMode === 'single'
			? subtitleStreams[tracks.subtitleTrackIndex]
			: undefined;

	const includeAudioTracks = tracks.audioEnabled && audioStreams.length > 0;
	const includeSubtitleTracks = !usingPreBurnedSource && tracks.subtitleEnabled && subtitleStreams.length > 0;
	const selectedAudioStreamsForExport = includeAudioTracks
		? audioExportMode === 'all'
			? audioStreams
			: selectedAudioStream
				? [selectedAudioStream]
				: []
		: [];

	const {
		selectedAudioStreamCount,
		selectedSourceAudioCodecs,
		selectedSourceAudioMaxBitrateKbps,
		selectedSourceAudioTotalBitrateKbps,
	} = summarizeAudioSelection(selectedAudioStreamsForExport);

	const sourceClipBytesEstimate =
		duration > 0
			? Math.round((sourceFile.size * Math.max(clipDuration, minTrimDuration)) / duration)
			: sourceFile.size;

	const vfParts = [...resizeFilterArgs, ...ffmpegFilterArgs];
	const noVideoFilters = vfParts.length === 0;

	let outputName = 'output.mp4';
	let ext = 'mp4';
	let includeAudio = includeAudioTracks;

	if (isCustomExport) {
		includeAudio = includeAudio && (audioNoReencode || advancedSettings.audioCodec !== 'none');
		const canCopyVideo = videoNoReencode && noVideoFilters;
		if (videoNoReencode && !noVideoFilters) {
			console.warn('[video] No-reencode override: active filters require re-encoding video');
		}
		if (canCopyVideo) {
			args.push('-c:v', 'copy');
		} else {
			if (vfParts.length > 0) args.push('-vf', vfParts.join(','));
			args.push('-threads', encodeThreads, '-c:v', advancedSettings.codec);
			if (advancedSettings.codec === 'libx264' || advancedSettings.codec === 'libx265') {
				args.push('-preset', advancedSettings.preset);
			}

			const rateControl =
				advancedSettings.rateControl === 'qp' && !codecSupportsQp(advancedSettings.codec)
					? 'crf'
					: advancedSettings.rateControl;
			if (rateControl === 'bitrate') {
				const targetKbps = Math.max(150, Math.round(advancedSettings.targetBitrateKbps));
				const maxRateKbps = Math.max(targetKbps, Math.round(targetKbps * 1.25));
				const bufSizeKbps = Math.max(targetKbps * 2, 300);
				args.push('-b:v', `${targetKbps}k`, '-maxrate', `${maxRateKbps}k`, '-bufsize', `${bufSizeKbps}k`);
			} else if (rateControl === 'qp') {
				args.push('-qp', String(advancedSettings.qp));
			} else {
				args.push('-crf', String(advancedSettings.crf));
				if (advancedSettings.codec === 'libvpx-vp9' || advancedSettings.codec === 'libaom-av1') {
					args.push('-b:v', '0');
				}
			}

			if (advancedSettings.codec === 'libx265') {
				args.push('-pix_fmt', 'yuv420p', '-tag:v', 'hvc1');
			}
		}

		if (includeAudio) {
			const canCopyAudio =
				selectedSourceAudioCodecs.length > 0 &&
				selectedSourceAudioCodecs.every((codec) => codec === advancedSettings.audioCodec);
			const audioContainerCompatible = isAudioContainerCompatible(
				advancedSettings.container,
				selectedSourceAudioCodecs,
			);
			if ((audioNoReencode || canCopyAudio) && audioContainerCompatible) {
				args.push('-c:a', 'copy');
			} else {
				if (audioNoReencode && !audioContainerCompatible) {
					console.warn(
						`[video] Audio re-encode: source incompatible with ${advancedSettings.container}, converting to ${advancedSettings.audioCodec}`,
					);
				}
				args.push('-c:a', advancedSettings.audioCodec, '-b:a', advancedSettings.audioBitrate);
			}
		}

		ext = advancedSettings.container;
		outputName = `output.${ext}`;
	} else {
		const {
			args: presetArgs,
			format,
			selectedAudioCodec: presetAudioCodec,
			recommendedAudioBitrateKbps: presetAudioBitrateKbps,
			shouldReencodeAudio: forcePresetAudioReencode,
		} = buildVideoArgs(selectedPreset, clipDuration, {
			sourceSizeBytes: sourceClipBytesEstimate,
			inputWidth: videoStreamInfo?.width,
			inputHeight: videoStreamInfo?.height,
			inputFps: videoFps,
			includeAudio: includeAudioTracks,
			sourceAudioCodecs: selectedSourceAudioCodecs,
			sourceAudioMaxBitrateKbps: selectedSourceAudioMaxBitrateKbps,
			sourceAudioTotalBitrateKbps: selectedSourceAudioTotalBitrateKbps,
			sourceAudioTrackCount: selectedAudioStreamCount,
		});

		const canCopyVideo = videoNoReencode && noVideoFilters;
		if (videoNoReencode && !noVideoFilters) {
			console.warn('[video] No-reencode override: active filters require re-encoding video');
		}
		if (canCopyVideo) {
			args.push('-c:v', 'copy');
		} else {
			appendPresetVideoArgsWithFilters(args, presetArgs, vfParts);
			args.push('-threads', encodeThreads);
		}

		if (includeAudioTracks) {
			const audioContainerCompatible = isAudioContainerCompatible(format, selectedSourceAudioCodecs);
			if (audioNoReencode && !forcePresetAudioReencode && audioContainerCompatible) {
				args.push('-c:a', 'copy');
			} else {
				if (audioNoReencode && (!audioContainerCompatible || forcePresetAudioReencode)) {
					console.warn(
						`[video] Audio re-encode: source audio incompatible with ${format}, converting to ${presetAudioCodec}`,
					);
				}
				args.push('-c:a', presetAudioCodec, '-b:a', `${presetAudioBitrateKbps}k`);
			}
		}

		ext = format;
		outputName = `output.${ext}`;
	}

	args.push('-map', '0:v:0');
	if (includeAudio) {
		if (usingPreBurnedSource || audioExportMode === 'all') {
			args.push('-map', '0:a?');
		} else if (selectedAudioStream) {
			args.push('-map', `0:${selectedAudioStream.index}`);
		}
	}

	if (includeSubtitleTracks) {
		const hasBitmapSubs = subtitleStreams.some((stream) =>
			BITMAP_SUB_CODECS.has(stream.codec?.toLowerCase() ?? ''),
		);
		if (!(ext === 'webm' && hasBitmapSubs)) {
			if (subtitleExportMode === 'all') {
				args.push('-map', '0:s?');
			} else if (selectedSubtitleStream) {
				args.push('-map', `0:${selectedSubtitleStream.index}`);
			}
			if (ext === 'mp4') {
				args.push('-c:s', 'mov_text');
			} else if (ext === 'webm') {
				args.push('-c:s', 'webvtt');
			} else {
				args.push('-c:s', 'copy');
			}
		} else {
			console.error('[video] Bitmap subtitles not supported in WebM, skipping');
		}
	}

	return {
		sourceFile,
		args,
		outputName,
		ext,
		clipDuration,
		usingPreBurnedSource,
		includeAudio,
		includeSubtitleTracks,
		isCustomExport,
		selectedAudioStream,
		selectedSubtitleStream,
	};
}
