import { useCallback, useRef, type MutableRefObject, type RefObject } from 'react';
import { toast } from 'sonner';
import type { SubtitlePreviewData } from '@/hooks/useVideoProcessor.ts';
import type { ProbeResult, ResizeSettings, TrackSelection } from '@/stores/videoEditor.ts';
import type { DetailedProbeResultData, ProbeResultData } from '@/workers/ffmpeg-worker.ts';
import { cacheKeyForFile, useVideoMetadataStore } from '@/stores/videoMetadata.ts';

export type MetadataLoadStage = 'idle' | 'fast-probe' | 'fonts' | 'ready' | 'error';

type FontData = { name: string; data: Uint8Array };
type TrackExportMode = 'all' | 'single';

interface UseVideoMetadataLoaderParams {
	probe: (file: File, onFonts?: (fonts: FontData[]) => void) => Promise<ProbeResultData>;
	probeDetails: (file: File) => Promise<DetailedProbeResultData>;
	preBurnedAssInputRef: RefObject<HTMLInputElement | null>;
	subtitleCacheRef: MutableRefObject<Map<string, SubtitlePreviewData>>;
	setFile: (value: File | null) => void;
	setResultUrl: (value: string | null) => void;
	setResultExt: (value: string | null) => void;
	setStreamInfoPending: (value: boolean) => void;
	setMetadataLoadStage: (stage: MetadataLoadStage) => void;
	setDetailedProbe: (value: DetailedProbeResultData | null) => void;
	setDetailedProbePending: (value: boolean) => void;
	setDetailedProbeError: (value: string | null) => void;
	setSelectedPreset: (value: string | null) => void;
	setCaptureMenuOpen: (value: boolean) => void;
	setTrimStart: (value: number) => void;
	setTrimEnd: (value: number) => void;
	setDuration: (value: number) => void;
	setCurrentTime: (value: number) => void;
	setAudioExportMode: (value: TrackExportMode) => void;
	setSubtitleExportMode: (value: TrackExportMode) => void;
	setUsePreBurnedAssSource: (value: boolean) => void;
	setPreBurnedAssSourceFile: (value: File | null) => void;
	setVideoNoReencode: (value: boolean) => void;
	setAudioNoReencode: (value: boolean) => void;
	setVideoUrl: (value: string | null) => void;
	setEmbeddedFonts: (value: FontData[]) => void;
	setProbeResult: (value: ProbeResult | null) => void;
	setTracks: (value: Partial<TrackSelection>) => void;
	setResize: (value: Partial<ResizeSettings>) => void;
}

function splitStreamsByType(streams: ProbeResultData['streams']): {
	videoStream: ProbeResultData['streams'][number] | undefined;
	audioStreams: ProbeResultData['streams'];
	subtitleStreams: ProbeResultData['streams'];
} {
	let videoStream: ProbeResultData['streams'][number] | undefined;
	const audioStreams: ProbeResultData['streams'] = [];
	const subtitleStreams: ProbeResultData['streams'] = [];
	for (const stream of streams) {
		if (stream.type === 'video' && videoStream == null) {
			videoStream = stream;
			continue;
		}
		if (stream.type === 'audio') {
			audioStreams.push(stream);
			continue;
		}
		if (stream.type === 'subtitle') {
			subtitleStreams.push(stream);
		}
	}
	return { videoStream, audioStreams, subtitleStreams };
}

function getDefaultAudioTrackIndex(audioStreams: ProbeResultData['streams']): number {
	const index = audioStreams.findIndex((stream) => stream.isDefault);
	return index >= 0 ? index : 0;
}

function getDefaultSubtitleTrackIndex(subtitleStreams: ProbeResultData['streams']): number {
	const defaultIndex = subtitleStreams.findIndex((stream) => stream.isDefault);
	if (defaultIndex >= 0) return defaultIndex;
	const forcedIndex = subtitleStreams.findIndex((stream) => stream.isForced);
	return forcedIndex >= 0 ? forcedIndex : 0;
}

export function useVideoMetadataLoader({
	probe,
	probeDetails,
	preBurnedAssInputRef,
	subtitleCacheRef,
	setFile,
	setResultUrl,
	setResultExt,
	setStreamInfoPending,
	setMetadataLoadStage,
	setDetailedProbe,
	setDetailedProbePending,
	setDetailedProbeError,
	setSelectedPreset,
	setCaptureMenuOpen,
	setTrimStart,
	setTrimEnd,
	setDuration,
	setCurrentTime,
	setAudioExportMode,
	setSubtitleExportMode,
	setUsePreBurnedAssSource,
	setPreBurnedAssSourceFile,
	setVideoNoReencode,
	setAudioNoReencode,
	setVideoUrl,
	setEmbeddedFonts,
	setProbeResult,
	setTracks,
	setResize,
}: UseVideoMetadataLoaderParams): (file: File) => void {
	const probeRequestIdRef = useRef(0);
	const detailedProbeRequestIdRef = useRef(0);

	return useCallback(
		(file: File) => {
			const probeRequestId = ++probeRequestIdRef.current;
			const detailedProbeRequestId = ++detailedProbeRequestIdRef.current;

			setFile(file);
			setResultUrl(null);
			setResultExt(null);
			setStreamInfoPending(true);
			setMetadataLoadStage('fast-probe');
			setDetailedProbe(null);
			setDetailedProbePending(true);
			setDetailedProbeError(null);
			setSelectedPreset(null);
			setCaptureMenuOpen(false);
			setTrimStart(0);
			setTrimEnd(0);
			setDuration(0);
			setCurrentTime(0);
			setAudioExportMode('all');
			setSubtitleExportMode('all');
			setUsePreBurnedAssSource(false);
			setPreBurnedAssSourceFile(null);
			setVideoNoReencode(false);
			setAudioNoReencode(true);
			setVideoUrl(URL.createObjectURL(file));
			if (preBurnedAssInputRef.current) preBurnedAssInputRef.current.value = '';
			toast.success('Video loaded', { description: file.name });

			setEmbeddedFonts([]);
			subtitleCacheRef.current.clear();
			const metadataKey = cacheKeyForFile(file);
			useVideoMetadataStore.getState().clearMetadata(metadataKey);

			probe(file, (fonts) => {
				if (probeRequestId !== probeRequestIdRef.current) return;
				setEmbeddedFonts(fonts);
			})
				.then((result) => {
					if (probeRequestId !== probeRequestIdRef.current) return;
					setStreamInfoPending(false);
					setMetadataLoadStage('ready');

					const { videoStream, audioStreams, subtitleStreams } = splitStreamsByType(result.streams);
					setProbeResult({
						duration: result.duration,
						bitrate: result.bitrate,
						format: result.format,
						streams: result.streams,
					});
					setTracks({
						audioEnabled: audioStreams.length > 0,
						audioTrackIndex: getDefaultAudioTrackIndex(audioStreams),
						subtitleEnabled: subtitleStreams.some((stream) => stream.isDefault || stream.isForced),
						subtitleTrackIndex: getDefaultSubtitleTrackIndex(subtitleStreams),
					});

					if (videoStream?.width && videoStream.height) {
						setResize({
							width: videoStream.width,
							height: videoStream.height,
							originalWidth: videoStream.width,
							originalHeight: videoStream.height,
							scalePercent: 100,
						});
					}

					probeDetails(file)
						.then((detailedResult) => {
							if (detailedProbeRequestId !== detailedProbeRequestIdRef.current) return;
							setDetailedProbe(detailedResult);
						})
						.catch((err: unknown) => {
							if (detailedProbeRequestId !== detailedProbeRequestIdRef.current) return;
							if (err instanceof Error && err.message.includes('Superseded')) return;
							setDetailedProbeError(err instanceof Error ? err.message : String(err));
						})
						.finally(() => {
							if (detailedProbeRequestId !== detailedProbeRequestIdRef.current) return;
							setDetailedProbePending(false);
						});
				})
				.catch((err: unknown) => {
					if (probeRequestId !== probeRequestIdRef.current) return;
					setStreamInfoPending(false);
					setMetadataLoadStage('error');
					setDetailedProbePending(false);
					setProbeResult(null);
					setTracks({
						audioEnabled: false,
						audioTrackIndex: 0,
						subtitleEnabled: false,
						subtitleTrackIndex: 0,
					});
					setEmbeddedFonts([]);
					toast.error('Failed to read video metadata', {
						description: err instanceof Error ? err.message : 'Could not read stream metadata.',
					});
				});
		},
		[
			probe,
			probeDetails,
			preBurnedAssInputRef,
			subtitleCacheRef,
			setFile,
			setResultUrl,
			setResultExt,
			setStreamInfoPending,
			setMetadataLoadStage,
			setDetailedProbe,
			setDetailedProbePending,
			setDetailedProbeError,
			setSelectedPreset,
			setCaptureMenuOpen,
			setTrimStart,
			setTrimEnd,
			setDuration,
			setCurrentTime,
			setAudioExportMode,
			setSubtitleExportMode,
			setUsePreBurnedAssSource,
			setPreBurnedAssSourceFile,
			setVideoNoReencode,
			setAudioNoReencode,
			setVideoUrl,
			setEmbeddedFonts,
			setProbeResult,
			setTracks,
			setResize,
		],
	);
}
