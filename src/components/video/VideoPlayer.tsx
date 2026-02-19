import type JASSUB from 'jassub';
import { AudioLines, Check, CircleOff, Languages, Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { formatPlayerTime } from '@/components/ui/index.ts';
import { useVideoEditorStore } from '@/stores/videoEditor.ts';
import { formatChannels, getLanguageName } from '@/utils/languageUtils.ts';

interface EmbeddedFont {
	name: string;
	data: Uint8Array;
}

interface VideoPlayerProps {
	src: string;
	previewFile?: File | null;
	timelineScrubbing?: boolean;
	scrubPreviewTime?: number | null;
	videoRef: RefObject<HTMLVideoElement | null>;
	metadataLoading?: boolean;
	assSubtitleContent?: string | null;
	embeddedFonts?: EmbeddedFont[];
	onLoadedMetadata?: () => void;
	onTimeUpdate?: () => void;
	onSeek?: (time: number) => void;
	processing?: boolean;
	progress?: number;
}

const BROWSER_UNSUPPORTED_AUDIO_CODECS = new Set(['eac3', 'ac3', 'dts', 'truehd', 'mlp', 'dts-hd', 'dtshd']);
const AC3_DECODER_REGISTRATION_FLAG = '__vixelyAc3DecoderRegistered';

function ensureAc3DecoderRegistered(registerAc3Decoder: () => void): void {
	const flags = globalThis as Record<string, unknown>;
	if (flags[AC3_DECODER_REGISTRATION_FLAG] === true) return;
	registerAc3Decoder();
	flags[AC3_DECODER_REGISTRATION_FLAG] = true;
}

function formatCodecLabel(codec?: string): string | null {
	if (!codec?.trim()) return null;
	const c = codec.trim().toLowerCase();
	const map: Record<string, string> = {
		aac: 'AAC',
		opus: 'Opus',
		mp3: 'MP3',
		mp3float: 'MP3',
		vorbis: 'Vorbis',
		flac: 'FLAC',
		ac3: 'AC-3',
		eac3: 'E-AC-3',
		'e-ac-3': 'E-AC-3',
		dts: 'DTS',
		truehd: 'TrueHD',
		ass: 'ASS',
		ssa: 'SSA',
		subrip: 'SRT',
		srt: 'SRT',
		webvtt: 'VTT',
		vtt: 'VTT',
		mov_text: 'Text',
		dvd_subtitle: 'DVD',
		dvdsub: 'DVD',
		hdmv_pgs_subtitle: 'PGS',
		pgssub: 'PGS',
	};
	return map[c] ?? codec.toUpperCase();
}

function formatExactTime(seconds: number): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const hours = Math.floor(totalMs / 3_600_000);
	const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
	const secs = Math.floor((totalMs % 60_000) / 1000);
	const ms = totalMs % 1000;
	if (hours > 0) {
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
	}
	return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function getFontMimeType(filename: string): string {
	const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')).toLowerCase() : '';
	switch (ext) {
		case '.otf':
			return 'font/otf';
		case '.woff':
			return 'font/woff';
		case '.woff2':
			return 'font/woff2';
		default:
			return 'font/ttf';
	}
}

function getFontFamilyFromFilename(filename: string): string {
	const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename;
	return base.replaceAll(/[-_]/g, ' ');
}

type ScrubPreviewRequest = { sequence: number; time: number };

export function VideoPlayer({
	src,
	previewFile,
	timelineScrubbing = false,
	scrubPreviewTime = null,
	videoRef,
	metadataLoading = false,
	assSubtitleContent,
	embeddedFonts = [],
	onLoadedMetadata,
	onTimeUpdate,
	onSeek,
	processing,
	progress = 0,
}: VideoPlayerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const seekBarRef = useRef<HTMLDivElement>(null);
	const [playing, setPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const [openMenu, setOpenMenu] = useState<'audio' | 'subtitle' | null>(null);
	const [, setAssRenderState] = useState<'inactive' | 'initializing' | 'ready' | 'failed'>('inactive');
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
	const [seekHoverRatio, setSeekHoverRatio] = useState<number | null>(null);
	const volumeRef = useRef(volume);
	volumeRef.current = volume;
	const mutedRef = useRef(muted);
	mutedRef.current = muted;
	const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
	const assRendererRef = useRef<JASSUB | null>(null);
	const assRendererVersionRef = useRef(0);
	const assRendererFontsRef = useRef<EmbeddedFont[] | null>(null);
	const decodedAudioContextRef = useRef<AudioContext | null>(null);
	const decodedAudioGainRef = useRef<GainNode | null>(null);
	const decodedAudioInputRef = useRef<{ dispose: () => void } | null>(null);
	const decodedAudioSinkRef = useRef<{
		buffers: (start?: number) => AsyncIterable<{ buffer: AudioBuffer; timestamp: number }>;
	} | null>(null);
	const decodedAudioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
	const decodedAudioStreamVersionRef = useRef(0);
	const scrubPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const scrubPreviewInputRef = useRef<{ dispose: () => void } | null>(null);
	const scrubPreviewSinkRef = useRef<{
		getCanvas: (timestamp: number) => Promise<{ canvas: HTMLCanvasElement | OffscreenCanvas } | null>;
	} | null>(null);
	const scrubPreviewRequestRef = useRef<ScrubPreviewRequest | null>(null);
	const scrubPreviewSequenceRef = useRef(0);
	const scrubPreviewDecodeActiveRef = useRef(false);
	const [showScrubPreviewFrame, setShowScrubPreviewFrame] = useState(false);

	const probeResult = useVideoEditorStore((s) => s.probeResult);
	const tracks = useVideoEditorStore((s) => s.tracks);
	const setTracks = useVideoEditorStore((s) => s.setTracks);
	const videoFilters = useVideoEditorStore((s) => s.filters);
	const subtitleEnabled = tracks.subtitleEnabled;
	const audioStreams = useMemo(() => probeResult?.streams.filter((s) => s.type === 'audio') ?? [], [probeResult]);
	const subtitleStreams = useMemo(
		() => probeResult?.streams.filter((s) => s.type === 'subtitle') ?? [],
		[probeResult],
	);
	const hasAudio = audioStreams.length > 0;
	const hasSubtitles = subtitleStreams.length > 0;
	const selectedAudioCodec = useMemo(() => {
		if (!tracks.audioEnabled || audioStreams.length === 0) return null;
		const stream = audioStreams[tracks.audioTrackIndex];
		return stream?.codec?.trim().toLowerCase() ?? null;
	}, [tracks.audioEnabled, tracks.audioTrackIndex, audioStreams]);
	const useDecodedAudioPreview = useMemo(() => {
		if (!previewFile || !tracks.audioEnabled || selectedAudioCodec == null) return false;
		return BROWSER_UNSUPPORTED_AUDIO_CODECS.has(selectedAudioCodec);
	}, [previewFile, tracks.audioEnabled, selectedAudioCodec]);
	const audioTrackMenuStreams = useMemo(() => {
		return audioStreams.map((s, i) => {
			const lang = getLanguageName(s.language);
			const title = s.title?.trim();
			const label = title || lang || `Track ${i + 1}`;
			const details = [formatCodecLabel(s.codec), formatChannels(s.channels)].filter(Boolean).join(' · ');
			return { label, details, isDefault: s.isDefault, isForced: s.isForced };
		});
	}, [audioStreams]);
	const subtitleTrackMenuStreams = useMemo(() => {
		return subtitleStreams.map((s, i) => {
			const lang = getLanguageName(s.language);
			const title = s.title?.trim();
			const label = title || lang || `Track ${i + 1}`;
			const details = [title && lang ? lang : null, formatCodecLabel(s.codec)].filter(Boolean).join(' · ');
			return { label, details, isDefault: s.isDefault, isForced: s.isForced };
		});
	}, [subtitleStreams]);
	const combinedFilter = useMemo(() => {
		const { brightness, contrast, saturation, hue } = videoFilters;
		const parts: string[] = [];
		if (brightness !== 0) parts.push(`brightness(${1 + brightness})`);
		if (contrast !== 1) parts.push(`contrast(${contrast})`);
		if (saturation !== 1) parts.push(`saturate(${saturation})`);
		if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);
		if (metadataLoading) parts.push('blur(2px)');
		return parts.length > 0 ? parts.join(' ') : undefined;
	}, [videoFilters, metadataLoading]);
	const sleep = useCallback(async (ms: number): Promise<void> => {
		await new Promise<void>((resolve) => setTimeout(resolve, ms));
	}, []);

	const stopDecodedAudioSources = useCallback((bumpVersion = true) => {
		if (bumpVersion) decodedAudioStreamVersionRef.current += 1;
		for (const source of decodedAudioSourcesRef.current) {
			try {
				source.stop();
			} catch {
				// Ignore, source may already be stopped.
			}
		}
		decodedAudioSourcesRef.current.clear();
	}, []);

	const clearScrubPreviewCanvas = useCallback(() => {
		const canvas = scrubPreviewCanvasRef.current;
		if (!canvas) {
			setShowScrubPreviewFrame(false);
			return;
		}
		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
		setShowScrubPreviewFrame(false);
	}, []);

	const drawScrubPreviewFrame = useCallback((source: HTMLCanvasElement | OffscreenCanvas): boolean => {
		const canvas = scrubPreviewCanvasRef.current;
		if (!canvas) return false;
		const width = Math.max(1, Math.floor(source.width));
		const height = Math.max(1, Math.floor(source.height));
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) return false;
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(source, 0, 0, width, height);
		setShowScrubPreviewFrame(true);
		return true;
	}, []);

	const drawVideoElementPreview = useCallback((): boolean => {
		const video = videoRef.current;
		const canvas = scrubPreviewCanvasRef.current;
		if (!video || !canvas) return false;
		const width = Math.max(1, Math.floor(video.videoWidth));
		const height = Math.max(1, Math.floor(video.videoHeight));
		if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
		if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) return false;
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(video, 0, 0, width, height);
		setShowScrubPreviewFrame(true);
		return true;
	}, [videoRef]);

	const runScrubPreviewDecode = useCallback(() => {
		if (scrubPreviewDecodeActiveRef.current) return;
		const sink = scrubPreviewSinkRef.current;
		if (!sink || scrubPreviewRequestRef.current == null) return;
		scrubPreviewDecodeActiveRef.current = true;
		const decodeLatest = async (): Promise<void> => {
			const request = scrubPreviewRequestRef.current;
			if (request == null) return;
			scrubPreviewRequestRef.current = null;
			const wrapped = await sink.getCanvas(request.time);
			if (wrapped && request.sequence === scrubPreviewSequenceRef.current) {
				drawScrubPreviewFrame(wrapped.canvas);
			}
			return decodeLatest();
		};
		void decodeLatest()
			.catch((err: unknown) => {
				console.error('[video] Failed to decode timeline scrub preview frame', err);
			})
			.finally(() => {
				scrubPreviewDecodeActiveRef.current = false;
				if (scrubPreviewRequestRef.current != null) {
					runScrubPreviewDecode();
				}
			});
	}, [drawScrubPreviewFrame]);

	const cleanupDecodedAudioGraph = useCallback(() => {
		stopDecodedAudioSources();
		const input = decodedAudioInputRef.current;
		decodedAudioInputRef.current = null;
		decodedAudioSinkRef.current = null;
		if (input) input.dispose();
		const ctx = decodedAudioContextRef.current;
		decodedAudioContextRef.current = null;
		decodedAudioGainRef.current = null;
		if (ctx) void ctx.close().catch(() => {});
	}, [stopDecodedAudioSources]);

	const ensureDecodedAudioGraph = useCallback(async () => {
		let ctx = decodedAudioContextRef.current;
		let gain = decodedAudioGainRef.current;
		if (!ctx || !gain) {
			ctx = new AudioContext();
			gain = ctx.createGain();
			gain.connect(ctx.destination);
			decodedAudioContextRef.current = ctx;
			decodedAudioGainRef.current = gain;
		}
		if (ctx.state === 'suspended') await ctx.resume();
		gain.gain.value = mutedRef.current ? 0 : volumeRef.current;
		return { ctx, gain };
	}, []);

	const startDecodedAudioStream = useCallback(
		async (fromTime: number) => {
			const video = videoRef.current;
			const sink = decodedAudioSinkRef.current;
			if (!video || !sink || !tracks.audioEnabled) return;
			stopDecodedAudioSources(false);
			const streamVersion = decodedAudioStreamVersionRef.current + 1;
			decodedAudioStreamVersionRef.current = streamVersion;

			let graph: { ctx: AudioContext; gain: GainNode };
			try {
				graph = await ensureDecodedAudioGraph();
			} catch {
				return;
			}
			if (streamVersion !== decodedAudioStreamVersionRef.current) return;
			const startVideoTime = Math.max(0, fromTime);
			const startCtxTime = graph.ctx.currentTime + 0.03;
			const playbackRate = Math.max(0.25, video.playbackRate || 1);
			try {
				for await (const wrapped of sink.buffers(startVideoTime)) {
					if (streamVersion !== decodedAudioStreamVersionRef.current) break;
					const relativeSec = (wrapped.timestamp - startVideoTime) / playbackRate;
					const when = startCtxTime + Math.max(0, relativeSec);
					// oxlint-disable-next-line eslint/no-await-in-loop
					while (
						streamVersion === decodedAudioStreamVersionRef.current &&
						when > graph.ctx.currentTime + 1.5
					) {
						// oxlint-disable-next-line eslint/no-await-in-loop
						await sleep(18);
					}
					if (streamVersion !== decodedAudioStreamVersionRef.current) break;
					const source = graph.ctx.createBufferSource();
					source.buffer = wrapped.buffer;
					source.playbackRate.value = playbackRate;
					source.connect(graph.gain);
					decodedAudioSourcesRef.current.add(source);
					source.onended = () => {
						decodedAudioSourcesRef.current.delete(source);
					};
					source.start(when);
				}
			} catch (err) {
				console.error('[video] Decoded audio preview failed', err);
			}
		},
		[ensureDecodedAudioGraph, sleep, stopDecodedAudioSources, tracks.audioEnabled, videoRef],
	);

	const destroyAssRenderer = useCallback(() => {
		assRendererVersionRef.current += 1;
		const renderer = assRendererRef.current;
		assRendererRef.current = null;
		assRendererFontsRef.current = null;
		if (!renderer) return;
		void renderer.destroy().catch((err: unknown) => {
			console.error('[video] Failed to destroy ASS renderer', err);
		});
	}, []);

	const repaintAssRenderer = useCallback(async () => {
		const renderer = assRendererRef.current;
		const video = videoRef.current;
		if (!renderer) return;
		try {
			await renderer.resize(Boolean(video?.paused));
		} catch {
			// Renderer may be in a transitional state (initializing/destroying)
		}
	}, [videoRef]);

	const normalizeAssOverlayLayer = useCallback((video: HTMLVideoElement) => {
		const parent = video.parentElement;
		if (!parent) return;
		const layer = Array.from(parent.children).find(
			(node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains('JASSUB'),
		);
		if (!layer) return;
		layer.style.position = 'absolute';
		layer.style.inset = '0';
		layer.style.pointerEvents = 'none';
		layer.style.zIndex = '1';
		const canvas = layer.querySelector('canvas');
		if (canvas instanceof HTMLCanvasElement) canvas.style.pointerEvents = 'none';
	}, []);

	const resetHideTimer = useCallback(() => {
		setShowControls(true);
		clearTimeout(hideTimeout.current);
		if (playing) {
			hideTimeout.current = setTimeout(() => {
				setShowControls(false);
			}, 2500);
		}
	}, [playing]);

	useEffect(() => {
		resetHideTimer();
		return () => {
			clearTimeout(hideTimeout.current);
		};
	}, [playing, resetHideTimer]);

	useEffect(() => {
		if (!showControls) setOpenMenu(null);
	}, [showControls]);

	useEffect(() => {
		return () => {
			cleanupDecodedAudioGraph();
		};
	}, [cleanupDecodedAudioGraph]);

	useEffect(() => {
		scrubPreviewSequenceRef.current += 1;
		scrubPreviewRequestRef.current = null;
		scrubPreviewDecodeActiveRef.current = false;
		const previousInput = scrubPreviewInputRef.current;
		scrubPreviewInputRef.current = null;
		scrubPreviewSinkRef.current = null;
		if (previousInput) previousInput.dispose();
		clearScrubPreviewCanvas();
		if (!previewFile) return;

		let cancelled = false;
		const setupScrubPreview = async () => {
			try {
				const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import('mediabunny');
				if (cancelled) return;
				const input = new Input({ source: new BlobSource(previewFile), formats: ALL_FORMATS });
				const videoTrack = await input.getPrimaryVideoTrack();
				if (cancelled) {
					input.dispose();
					return;
				}
				if (!videoTrack) {
					input.dispose();
					return;
				}
				const canDecode = await videoTrack.canDecode();
				if (cancelled) {
					input.dispose();
					return;
				}
				if (!canDecode) {
					input.dispose();
					return;
				}
				scrubPreviewInputRef.current = input;
				scrubPreviewSinkRef.current = new CanvasSink(videoTrack, { poolSize: 2 });
				runScrubPreviewDecode();
			} catch (err) {
				console.error('[video] Failed to initialize timeline scrub preview', err);
			}
		};
		void setupScrubPreview();

		return () => {
			cancelled = true;
			scrubPreviewSequenceRef.current += 1;
			scrubPreviewRequestRef.current = null;
			scrubPreviewDecodeActiveRef.current = false;
			const input = scrubPreviewInputRef.current;
			scrubPreviewInputRef.current = null;
			scrubPreviewSinkRef.current = null;
			if (input) input.dispose();
			clearScrubPreviewCanvas();
		};
	}, [previewFile, clearScrubPreviewCanvas, runScrubPreviewDecode]);

	useEffect(() => {
		if (!timelineScrubbing || scrubPreviewTime == null || !Number.isFinite(scrubPreviewTime)) {
			scrubPreviewSequenceRef.current += 1;
			scrubPreviewRequestRef.current = null;
			clearScrubPreviewCanvas();
			return;
		}
		const clampedTime = Math.max(0, scrubPreviewTime);
		const sequence = scrubPreviewSequenceRef.current + 1;
		scrubPreviewSequenceRef.current = sequence;
		scrubPreviewRequestRef.current = { sequence, time: clampedTime };
		if (!scrubPreviewSinkRef.current) {
			drawVideoElementPreview();
			return;
		}
		runScrubPreviewDecode();
	}, [timelineScrubbing, scrubPreviewTime, clearScrubPreviewCanvas, drawVideoElementPreview, runScrubPreviewDecode]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let fullscreenSyncRafA: number | null = null;
		let fullscreenSyncRafB: number | null = null;
		let fullscreenSyncTimer: ReturnType<typeof setTimeout> | null = null;

		const resizeAssRenderer = () => {
			void repaintAssRenderer().catch((err: unknown) => {
				console.error('[video] Failed to resize ASS renderer after fullscreen change', err);
			});
		};

		const updateSize = () => {
			const fullscreenActive = document.fullscreenElement === container;
			if (fullscreenActive) {
				const viewport = window.visualViewport;
				const width = Math.round(viewport?.width ?? window.innerWidth);
				const height = Math.round(viewport?.height ?? window.innerHeight);
				setContainerSize({ width, height });
				return;
			}
			const rect = container.getBoundingClientRect();
			const width = Math.round(container.clientWidth || rect.width || 0);
			const height = Math.round(container.clientHeight || rect.height || 0);
			setContainerSize({ width, height });
		};
		const scheduleFullscreenSync = () => {
			if (fullscreenSyncRafA != null) cancelAnimationFrame(fullscreenSyncRafA);
			if (fullscreenSyncRafB != null) cancelAnimationFrame(fullscreenSyncRafB);
			if (fullscreenSyncTimer != null) clearTimeout(fullscreenSyncTimer);

			fullscreenSyncRafA = requestAnimationFrame(() => {
				updateSize();
				resizeAssRenderer();
				fullscreenSyncRafB = requestAnimationFrame(() => {
					updateSize();
					resizeAssRenderer();
				});
			});
			fullscreenSyncTimer = setTimeout(() => {
				updateSize();
				resizeAssRenderer();
			}, 180);
		};
		const handleFullscreenChange = () => {
			const fullscreenActive = document.fullscreenElement === container;
			setIsFullscreen(fullscreenActive);
			if (fullscreenActive) {
				scheduleFullscreenSync();
				return;
			}
			updateSize();
			resizeAssRenderer();
		};
		const handleWindowResize = () => {
			if (document.fullscreenElement === container) {
				scheduleFullscreenSync();
				return;
			}
			updateSize();
		};

		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(container);
		window.addEventListener('resize', handleWindowResize);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', handleWindowResize);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			if (fullscreenSyncRafA != null) cancelAnimationFrame(fullscreenSyncRafA);
			if (fullscreenSyncRafB != null) cancelAnimationFrame(fullscreenSyncRafB);
			if (fullscreenSyncTimer != null) clearTimeout(fullscreenSyncTimer);
		};
	}, []);

	useEffect(() => {
		return () => {
			destroyAssRenderer();
		};
	}, [destroyAssRenderer]);

	useEffect(() => {
		if (embeddedFonts.length === 0) return;
		const blobUrls: string[] = [];
		const style = document.createElement('style');
		style.dataset.vixelyFonts = 'true';
		const rules: string[] = [];
		for (const font of embeddedFonts) {
			const mime = getFontMimeType(font.name);
			const blob = new Blob([new Uint8Array(font.data)], { type: mime });
			const url = URL.createObjectURL(blob);
			blobUrls.push(url);
			const family = getFontFamilyFromFilename(font.name);
			rules.push(`@font-face { font-family: "${family}"; src: url("${url}"); font-display: swap; }`);
		}
		style.textContent = rules.join('\n');
		document.head.appendChild(style);
		return () => {
			style.remove();
			for (const url of blobUrls) URL.revokeObjectURL(url);
		};
	}, [embeddedFonts]);

	useEffect(() => {
		const video = videoRef.current;
		const content = subtitleEnabled ? assSubtitleContent?.trim() : null;
		if (!video) {
			setAssRenderState('inactive');
			destroyAssRenderer();
			return;
		}

		let cancelled = false;
		const version = ++assRendererVersionRef.current;

		if (!content) {
			setAssRenderState('inactive');
			const clearTrack = async () => {
				try {
					const renderer = assRendererRef.current;
					if (!renderer) return;
					await renderer.setVideo(video);
					await renderer.ready;
					if (cancelled || version !== assRendererVersionRef.current) return;
					await renderer.renderer.freeTrack();
					if (cancelled || version !== assRendererVersionRef.current) return;
					if (video.paused) await repaintAssRenderer();
				} catch (err) {
					console.error('[video] Failed to clear ASS track', err);
					destroyAssRenderer();
				}
			};
			void clearTrack();
			return () => {
				cancelled = true;
			};
		}

		setAssRenderState('initializing');

		const setupAssRenderer = async () => {
			try {
				const { default: JassubRenderer } = await import('jassub');
				if (cancelled || version !== assRendererVersionRef.current) return;

				let renderer = assRendererRef.current;
				if (renderer && assRendererFontsRef.current !== embeddedFonts) {
					assRendererRef.current = null;
					assRendererFontsRef.current = null;
					await renderer.destroy();
					renderer = null;
				}
				if (cancelled || version !== assRendererVersionRef.current) return;
				if (!renderer) {
					renderer = new JassubRenderer({
						video,
						subContent: content,
						fonts:
							embeddedFonts.length > 0
								? embeddedFonts.map((f) => URL.createObjectURL(new Blob([new Uint8Array(f.data)])))
								: [],
						maxRenderHeight: 1440,
					});
					assRendererRef.current = renderer;
					assRendererFontsRef.current = embeddedFonts;
					await renderer.ready;
				} else {
					await renderer.setVideo(video);
					await renderer.ready;
				}
				normalizeAssOverlayLayer(video);

				if (cancelled || version !== assRendererVersionRef.current) return;
				await renderer.renderer.setTrack(content);
				if (cancelled || version !== assRendererVersionRef.current) return;
				if (video.paused && video.videoWidth > 0 && video.videoHeight > 0) await repaintAssRenderer();
				if (cancelled || version !== assRendererVersionRef.current) return;
				setAssRenderState('ready');
			} catch (err) {
				console.error('[video] Failed to initialize ASS renderer', err);
				setAssRenderState('failed');
				destroyAssRenderer();
			}
		};

		void setupAssRenderer();

		return () => {
			cancelled = true;
		};
	}, [
		videoRef,
		subtitleEnabled,
		assSubtitleContent,
		embeddedFonts,
		destroyAssRenderer,
		repaintAssRenderer,
		normalizeAssOverlayLayer,
	]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (!useDecodedAudioPreview || !previewFile || tracks.audioTrackIndex < 0) {
			stopDecodedAudioSources();
			return;
		}

		let cancelled = false;
		const registerAndCreateSink = async () => {
			try {
				const [{ ALL_FORMATS, AudioBufferSink, BlobSource, Input }, { registerAc3Decoder }] = await Promise.all(
					[import('mediabunny'), import('@mediabunny/ac3')],
				);
				if (cancelled) return;
				ensureAc3DecoderRegistered(registerAc3Decoder);

				const input = new Input({ source: new BlobSource(previewFile), formats: ALL_FORMATS });
				const audioTracks = await input.getAudioTracks();
				if (cancelled) {
					input.dispose();
					return;
				}
				const selectedTrack = audioTracks[tracks.audioTrackIndex];
				if (!selectedTrack) {
					input.dispose();
					return;
				}
				const canDecode = await selectedTrack.canDecode();
				if (!canDecode) {
					input.dispose();
					console.error('[video] Selected audio track cannot be decoded for preview');
					return;
				}

				decodedAudioInputRef.current = input;
				decodedAudioSinkRef.current = new AudioBufferSink(selectedTrack);

				const startFromVideo = () => {
					if (!tracks.audioEnabled || video.paused) return;
					void startDecodedAudioStream(video.currentTime);
				};
				const handlePlay = () => {
					startFromVideo();
				};
				const handlePause = () => {
					stopDecodedAudioSources();
				};
				const handleSeeked = () => {
					if (!tracks.audioEnabled) {
						stopDecodedAudioSources();
						return;
					}
					if (video.paused) {
						stopDecodedAudioSources();
						return;
					}
					startFromVideo();
				};
				const handleRateChange = () => {
					if (!tracks.audioEnabled || video.paused) return;
					startFromVideo();
				};
				const handleEnded = () => {
					stopDecodedAudioSources();
				};

				video.addEventListener('play', handlePlay);
				video.addEventListener('pause', handlePause);
				video.addEventListener('seeked', handleSeeked);
				video.addEventListener('ratechange', handleRateChange);
				video.addEventListener('ended', handleEnded);
				startFromVideo();

				const previousInput = decodedAudioInputRef.current;
				const previousSink = decodedAudioSinkRef.current;
				return () => {
					video.removeEventListener('play', handlePlay);
					video.removeEventListener('pause', handlePause);
					video.removeEventListener('seeked', handleSeeked);
					video.removeEventListener('ratechange', handleRateChange);
					video.removeEventListener('ended', handleEnded);
					stopDecodedAudioSources();
					if (previousInput === decodedAudioInputRef.current) decodedAudioInputRef.current = null;
					if (previousSink === decodedAudioSinkRef.current) decodedAudioSinkRef.current = null;
					input.dispose();
				};
			} catch (err) {
				console.error('[video] Failed to initialize decoded audio preview', err);
				return;
			}
		};

		let teardown: (() => void) | undefined;
		void registerAndCreateSink().then((cleanup) => {
			if (cancelled) {
				cleanup?.();
				return;
			}
			teardown = cleanup;
		});

		return () => {
			cancelled = true;
			teardown?.();
		};
	}, [
		previewFile,
		startDecodedAudioStream,
		stopDecodedAudioSources,
		tracks.audioEnabled,
		tracks.audioTrackIndex,
		useDecodedAudioPreview,
		videoRef,
	]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !useDecodedAudioPreview) return;
		video.muted = true;
		return () => {
			video.muted = mutedRef.current;
			stopDecodedAudioSources();
		};
	}, [stopDecodedAudioSources, useDecodedAudioPreview, videoRef]);

	useEffect(() => {
		if (!useDecodedAudioPreview) return;
		const gain = decodedAudioGainRef.current;
		if (!gain) return;
		gain.gain.value = muted ? 0 : volume;
	}, [muted, useDecodedAudioPreview, volume]);

	const handleMetadata = useCallback(() => {
		const v = videoRef.current;
		if (v) {
			setDuration(v.duration);
			setVideoSize({ width: v.videoWidth, height: v.videoHeight });
			onLoadedMetadata?.();
			if (assRendererRef.current && v.paused && v.videoWidth > 0 && v.videoHeight > 0) {
				void repaintAssRenderer();
			}
		}
	}, [videoRef, onLoadedMetadata, repaintAssRenderer]);

	const handleTimeUpdate = useCallback(() => {
		const v = videoRef.current;
		if (v) {
			setCurrentTime(v.currentTime);
			onTimeUpdate?.();
		}
	}, [videoRef, onTimeUpdate]);

	const handleSeeked = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		setCurrentTime(v.currentTime);
		onTimeUpdate?.();

		if (!v.paused || !subtitleEnabled || !assSubtitleContent?.trim()) return;
		void repaintAssRenderer().catch((err: unknown) => {
			console.error('[video] Failed to repaint ASS subtitles after seek', err);
		});
	}, [videoRef, onTimeUpdate, subtitleEnabled, assSubtitleContent, repaintAssRenderer]);

	const togglePlay = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		if (v.paused) {
			void v.play().catch(() => {});
			setPlaying(true);
		} else {
			v.pause();
			setPlaying(false);
		}
	}, [videoRef]);

	const updateSeekHover = useCallback(
		(clientX: number): number | null => {
			const bar = seekBarRef.current;
			if (!bar || duration <= 0) return null;
			const rect = bar.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			setSeekHoverRatio(ratio);
			return ratio;
		},
		[duration],
	);

	const handleSeek = useCallback(
		(e: React.PointerEvent) => {
			const v = videoRef.current;
			if (!v) return;
			const ratio = updateSeekHover(e.clientX);
			if (ratio == null) return;
			const targetTime = ratio * duration;
			if (typeof v.fastSeek === 'function') {
				v.fastSeek(targetTime);
			} else {
				v.currentTime = targetTime;
			}
			setCurrentTime(targetTime);
			onSeek?.(targetTime);
		},
		[videoRef, duration, onSeek, updateSeekHover],
	);

	const handleSeekPointerMove = useCallback(
		(e: React.PointerEvent) => {
			updateSeekHover(e.clientX);
			if (e.buttons === 1) handleSeek(e);
		},
		[handleSeek, updateSeekHover],
	);

	const handleSeekPointerEnter = useCallback(
		(e: React.PointerEvent) => {
			updateSeekHover(e.clientX);
		},
		[updateSeekHover],
	);

	const handleSeekPointerLeave = useCallback(() => {
		setSeekHoverRatio(null);
	}, []);

	const toggleMute = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		const next = !muted;
		if (useDecodedAudioPreview) {
			const gain = decodedAudioGainRef.current;
			if (gain) gain.gain.value = next ? 0 : volume;
		}
		if (!useDecodedAudioPreview) {
			v.muted = next;
		}
		setMuted(next);
	}, [videoRef, muted, useDecodedAudioPreview, volume]);

	const handleVolumeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = videoRef.current;
			if (!v) return;
			const val = Number(e.target.value);
			if (useDecodedAudioPreview) {
				const gain = decodedAudioGainRef.current;
				if (gain) gain.gain.value = val;
			}
			if (!useDecodedAudioPreview) v.volume = val;
			setVolume(val);
			if (val === 0) {
				if (!useDecodedAudioPreview) v.muted = true;
				setMuted(true);
			} else if (muted) {
				if (!useDecodedAudioPreview) v.muted = false;
				setMuted(false);
			}
		},
		[muted, useDecodedAudioPreview, videoRef],
	);

	const toggleFullscreen = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		if (document.fullscreenElement) {
			void document.exitFullscreen().catch(() => {});
		} else {
			void el.requestFullscreen().catch(() => {});
		}
	}, []);

	const handleEnded = useCallback(() => {
		setPlaying(false);
	}, []);

	const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
	const playerFrameStyle = useMemo(() => {
		const { width: videoWidth, height: videoHeight } = videoSize;
		const { width: containerWidth, height: containerHeight } = containerSize;
		if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) {
			return { width: '100%', height: '100%' } as const;
		}
		const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
		return { width: `${videoWidth * scale}px`, height: `${videoHeight * scale}px` } as const;
	}, [videoSize, containerSize]);

	return (
		<div
			ref={containerRef}
			className="relative w-full h-full group overflow-hidden flex items-center justify-center"
			style={isFullscreen ? { width: '100vw', height: '100vh' } : undefined}
			onDragOver={(e) => {
				e.preventDefault();
			}}
		>
			<div
				className="relative overflow-hidden rounded-xl transition-[width,height] duration-200"
				style={playerFrameStyle}
				onPointerMove={resetHideTimer}
				onPointerLeave={() => {
					if (playing) setShowControls(false);
				}}
			>
				<video
					ref={videoRef}
					src={src}
					onLoadedMetadata={handleMetadata}
					onTimeUpdate={handleTimeUpdate}
					onSeeked={handleSeeked}
					onPlay={() => {
						setPlaying(true);
					}}
					onPause={() => {
						setPlaying(false);
					}}
					onEnded={handleEnded}
					onError={(e) => {
						const video = e.currentTarget;
						const err = video.error;
						if (err) console.error('[video] Media error', { code: err.code, message: err.message });
					}}
					onClick={togglePlay}
					draggable={false}
					onDragStart={(e) => {
						e.preventDefault();
					}}
					className="w-full h-full object-contain cursor-pointer transition-[filter] duration-200"
					style={combinedFilter ? { filter: combinedFilter } : undefined}
				/>
				<canvas
					ref={scrubPreviewCanvasRef}
					className={`pointer-events-none absolute inset-0 z-10 h-full w-full object-contain transition-opacity duration-100 ${
						timelineScrubbing && showScrubPreviewFrame ? 'opacity-100' : 'opacity-0'
					}`}
					style={combinedFilter ? { filter: combinedFilter } : undefined}
					aria-hidden="true"
				/>

				<div
					className={`absolute bottom-0 left-0 right-0 z-20 rounded-b-xl bg-gradient-to-t from-black/80 to-transparent px-3 sm:px-4 pt-8 pb-3 transition-opacity duration-200 ${
						showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
					}`}
				>
					{/* Seek bar */}
					<div
						ref={seekBarRef}
						className="h-1.5 w-full bg-white/20 rounded-full mb-3 cursor-pointer relative group/seek touch-none"
						onPointerDown={handleSeek}
						onPointerEnter={handleSeekPointerEnter}
						onPointerMove={handleSeekPointerMove}
						onPointerLeave={handleSeekPointerLeave}
					>
						{seekHoverRatio != null && (
							<div
								className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-md border border-white/20 bg-black/85 px-1.5 py-0.5 text-[14px] font-mono tabular-nums text-white shadow-lg"
								style={{ left: `${seekHoverRatio * 100}%` }}
							>
								{formatExactTime(seekHoverRatio * duration)}
							</div>
						)}
						<div
							className="absolute inset-y-0 left-0 bg-accent rounded-full"
							style={{ width: `${pct}%` }}
						/>
						<div
							className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity"
							style={{ left: `${pct}%`, transform: `translate(-50%, -50%)` }}
						/>
					</div>

					<div className="flex items-center gap-2 sm:gap-3">
						{/* Play/Pause */}
						<button
							onClick={togglePlay}
							className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
						>
							{playing ? <Pause size={18} /> : <Play size={18} />}
						</button>

						{/* Time */}
						<span className="text-[14px] font-mono text-white/80 tabular-nums">
							{formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
						</span>

						<div className="flex-1" />

						{/* Audio track selector */}
						<div className="relative">
							<button
								onClick={
									hasAudio
										? () => {
												setOpenMenu(openMenu === 'audio' ? null : 'audio');
											}
										: undefined
								}
								className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
									!hasAudio
										? 'text-white/30 cursor-not-allowed'
										: openMenu === 'audio'
											? 'bg-white/20 text-white cursor-pointer'
											: 'text-white hover:bg-white/10 cursor-pointer'
								} ${hasAudio && !tracks.audioEnabled ? 'opacity-50' : ''}`}
								title="Audio tracks"
								disabled={!hasAudio}
							>
								<AudioLines size={16} />
							</button>
							{hasAudio && openMenu === 'audio' && (
								<TrackMenu
									label="Audio"
									enabled={tracks.audioEnabled}
									onToggle={() => {
										setTracks({ audioEnabled: !tracks.audioEnabled });
									}}
									onClose={() => {
										setOpenMenu(null);
									}}
									canDisable
									selectedIndex={tracks.audioTrackIndex}
									onSelect={(i) => {
										setTracks({ audioTrackIndex: i });
									}}
									streams={audioTrackMenuStreams}
								/>
							)}
						</div>

						{/* Subtitle track selector */}
						<div className="relative">
							<button
								onClick={
									hasSubtitles
										? () => {
												setOpenMenu(openMenu === 'subtitle' ? null : 'subtitle');
											}
										: undefined
								}
								className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${
									!hasSubtitles
										? 'text-white/30 cursor-not-allowed'
										: openMenu === 'subtitle'
											? 'bg-white/20 text-white cursor-pointer'
											: 'text-white hover:bg-white/10 cursor-pointer'
								} ${hasSubtitles && !tracks.subtitleEnabled ? 'opacity-50' : ''}`}
								title="Subtitle tracks"
								disabled={!hasSubtitles}
							>
								<Languages size={16} />
							</button>
							{hasSubtitles && openMenu === 'subtitle' && (
								<TrackMenu
									label="Subtitles"
									enabled={tracks.subtitleEnabled}
									onToggle={() => {
										setTracks({ subtitleEnabled: !tracks.subtitleEnabled });
									}}
									onClose={() => {
										setOpenMenu(null);
									}}
									canDisable
									selectedIndex={tracks.subtitleTrackIndex}
									onSelect={(i) => {
										setTracks({ subtitleTrackIndex: i });
									}}
									streams={subtitleTrackMenuStreams}
								/>
							)}
						</div>

						{/* Volume */}
						<button
							onClick={toggleMute}
							className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
						>
							{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
						</button>
						<input
							type="range"
							min={0}
							max={1}
							step={0.05}
							value={muted ? 0 : volume}
							onChange={handleVolumeChange}
							className="w-12 sm:w-16 h-1 accent-white"
						/>

						{/* Fullscreen */}
						<button
							onClick={toggleFullscreen}
							className="h-8 w-8 flex items-center justify-center rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
						>
							<Maximize size={16} />
						</button>
					</div>
				</div>
			</div>

			{/* Processing overlay */}
			{processing && (
				<div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/80 backdrop-blur-sm">
					<div className="h-10 w-10 rounded-full border-[3px] border-border border-t-accent animate-spin" />
					<p className="mt-3 text-sm font-medium font-mono tabular-nums">
						Exporting... {(Math.max(0, progress) * 100).toFixed(2)}%
					</p>
					<div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-surface-raised">
						<div
							className="h-full bg-accent transition-all duration-300"
							style={{ width: `${Math.max(0, progress) * 100}%` }}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

function TrackMenu({
	label,
	enabled,
	onToggle,
	onClose,
	canDisable,
	selectedIndex,
	onSelect,
	streams,
}: {
	label: string;
	enabled: boolean;
	onToggle: () => void;
	onClose: () => void;
	canDisable: boolean;
	selectedIndex: number;
	onSelect: (index: number) => void;
	streams: { label: string; details: string; isDefault?: boolean; isForced?: boolean }[];
}) {
	return (
		<div className="absolute bottom-full right-0 mb-2 w-[min(18rem,80vw)] rounded-lg border border-white/15 bg-neutral-950/95 backdrop-blur-md shadow-[0_10px_20px_rgba(0,0,0,0.45)] animate-fade-in overflow-hidden">
			<div className="px-3 py-2 border-b border-white/10">
				<p className="text-[14px] font-semibold text-white/50 uppercase tracking-[0.12em]">{label}</p>
			</div>

			<div className="p-1.5 space-y-0.5">
				{canDisable && (
					<button
						onClick={() => {
							onToggle();
							onClose();
						}}
						className={`w-full text-left rounded-md px-2.5 py-2 transition-colors cursor-pointer ${
							!enabled ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
						}`}
					>
						<div className="flex items-center gap-2.5">
							<CircleOff size={14} className={!enabled ? 'text-white' : 'text-white/40'} />
							<span className="text-[14px] font-medium">Off</span>
							{!enabled && <Check size={13} className="ml-auto text-white" />}
						</div>
					</button>
				)}

				<div className="max-h-44 overflow-y-auto space-y-0.5">
					{streams.map((stream, i) => {
						const isActive = enabled && selectedIndex === i;
						return (
							<button
								key={i}
								onClick={() => {
									if (!enabled) onToggle();
									onSelect(i);
									onClose();
								}}
								className={`w-full text-left rounded-md px-2.5 py-2 transition-all cursor-pointer ${
									isActive
										? 'bg-accent/15 text-white'
										: 'text-white/80 hover:bg-white/[0.06] hover:text-white'
								}`}
							>
								<div className="flex items-center gap-2.5">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.5">
											<p className="text-[14px] font-medium truncate">{stream.label}</p>
											{stream.isDefault && (
												<span className="shrink-0 text-[14px] font-semibold uppercase tracking-wider bg-white/10 text-white/60 px-1.5 py-0.5 rounded leading-none">
													Default
												</span>
											)}
											{stream.isForced && (
												<span className="shrink-0 text-[14px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400/80 px-1.5 py-0.5 rounded leading-none">
													Forced
												</span>
											)}
										</div>
										{stream.details && (
											<p className="text-[14px] text-white/40 mt-0.5 truncate">
												{stream.details}
											</p>
										)}
									</div>
									<div
										className={`h-4 w-4 shrink-0 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
											isActive
												? 'border-accent bg-accent text-white'
												: 'border-white/20 text-transparent'
										}`}
									>
										<Check size={10} />
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
