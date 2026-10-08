import { useNavigate } from '@tanstack/react-router';
import { Captions } from 'lucide-react';
import {
	type ComponentProps,
	type CSSProperties,
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { keptRanges } from '@/document/kept';
import { toOutput } from '@/document/timemap';
import { CropOverlay } from '@/editor/CropOverlay';
import type { OverlayEditing } from '@/editor/overlays/editing';
import { shownAt } from '@/editor/overlays/model';
import { CroppedLayers, OverlayLayer } from '@/editor/overlays/OverlayLayer';
import { AudioTrackMenu, PlayerControls, PlayerMenu } from '@/editor/PlayerControls';
import { VolumeControl } from '@/editor/VolumeControl';
import {
	backingSize,
	CompareButtons,
	copyPicture,
	OriginalPicture,
	useShowsOriginal,
	ZoomStage,
} from '@/editor/ZoomStage';
import { EDITORS } from '@/editors/registry';
import { trackName } from '@/lib/language';
import { usePlayback } from '@/media/playback';
import { download } from '@/media/save';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { useCapturedSubtitles } from '../image/captured';
import { effectiveCrop, type ImageDoc, orientedSize, type Rect, type Size, wholePictureDoc } from '../image/document';
import type { PictureEditing } from '../image/editing';
import { ImageRenderer } from '../image/renderer';
import { cropRatio } from '../image/store';
import { isAdded, type TrackKey, type TrackState, useProjectTracks, useSubtitleProject } from '../subtitles/project';
import { useSubtitleDoc } from '../subtitles/store';
import { SubtitleLayer } from '../subtitles/SubtitleViewer';
import { codecLabel } from '../subtitles/tracks';
import { capturePicture, captureShown, carryEdits, withSubtitles } from './capture';
import { type CaptureAction, CapturePopover, type CaptureSource } from './CapturePopover';
import { fadeLevel, fadeOf, speedOf, videoLength } from './document';
import { useLeftOut } from './mux';
import { useVideoDoc } from './store';
import { VideoFit, VideoTime } from './VideoTimeline';

const OFF = 'off';

/** What a subtitle track is written in, as players name it: SRT, ASS, PGS. */
function subtitleType(track: TrackState): string | undefined {
	if (track.doc && (track.edited || !track.info))
		return SUBTITLE_TYPES[track.doc.format] ?? track.doc.format.toUpperCase();
	return track.info ? codecLabel(track.info) : undefined;
}

const SUBTITLE_TYPES: Record<string, string> = { srt: 'SRT', ass: 'ASS', vtt: 'WebVTT', pgs: 'PGS' };

/** Which subtitle track shows over the video: the one edited in the subtitle editor, marked so. */
function SubtitleMenu({ file, shown, onShown }: { file: File; shown: boolean; onShown: (shown: boolean) => void }) {
	const tracks = useProjectTracks();
	const current = useOfferedSubtitles(file);
	const choose = useSubtitleProject((state) => state.choose);
	const leftOut = useLeftOut(file);
	const options = tracks.filter(
		(track) =>
			(track.original || track.reading) &&
			(track.key !== 'new' || track.edited) &&
			!leftOut.has(`subtitle-${track.key}`),
	);
	if (options.length === 0) return null;
	return (
		<PlayerMenu
			icon={Captions}
			label={m.player_subtitles()}
			active={shown && current !== null}
			value={shown && current !== null ? String(current) : OFF}
			items={[
				{ value: OFF, label: m.player_subtitles_off(), divider: true },
				...options.map((track) => ({
					value: String(track.key),
					label: `${track.info ? trackName(track.info.language, track.info.name) : m.subs_new_track()}${track.edited && !isAdded(track.key) ? ` (${m.subs_track_edited()})` : ''}`,
					description: subtitleType(track),
				})),
			]}
			onChange={(value) => {
				if (value === OFF) {
					onShown(false);
					return;
				}
				const key = options.find((track) => String(track.key) === value)?.key;
				if (key !== undefined) choose(key);
				onShown(true);
			}}
		/>
	);
}

/**
 * Draws a picture of the video as edited, after the original when comparing. The grain moves with
 * the pictures, as in the export.
 */
function draw(
	renderer: ImageRenderer,
	canvas: HTMLCanvasElement,
	{ doc, region, original }: { doc: ImageDoc; region: Rect; original: RefObject<HTMLCanvasElement | null> | null },
	time: number | undefined,
) {
	const seed = (time ?? 0) * 97;
	if (original) {
		renderer.render(doc, { region, original: true, seed, time });
		copyPicture(canvas, original.current);
	}
	renderer.render(doc, { region, seed, time });
}

/**
 * The picture of the playing video as edited: drawn by the image editor's renderer, so crop,
 * turns and colours show on every frame as they will be exported. Edits redraw the picture on
 * screen without decoding it again.
 */
function EditedPicture({
	region,
	width,
	height,
	doc,
	original,
	children,
}: {
	region: Rect;
	width: number;
	height: number;
	doc: ImageDoc;
	/** Where the picture as it comes is drawn too, to compare; null when not comparing. */
	original: RefObject<HTMLCanvasElement | null> | null;
	children?: ReactNode;
}) {
	const player = usePlayback((state) => state.player);
	const video = usePlayback((state) => state.details?.video ?? null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<ImageRenderer | null>(null);
	// Read by the painter, which draws pictures as playback delivers them.
	const shown = useRef({ doc, region, original });
	const frameTime = useRef<number | undefined>(undefined);
	shown.current = { doc, region, original };

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !player || !video) return;
		let renderer: ImageRenderer;
		try {
			renderer = new ImageRenderer(canvas);
		} catch {
			return;
		}
		rendererRef.current = renderer;
		const detach = player.attach(canvas, (sample) => {
			renderer.setFrame(
				sample.toCanvasImageSource(),
				{ width: sample.squarePixelWidth, height: sample.squarePixelHeight },
				sample.rotation,
			);
			frameTime.current = sample.timestamp;
			draw(renderer, canvas, shown.current, sample.timestamp);
		});
		return () => {
			detach();
			renderer.dispose();
			rendererRef.current = null;
		};
	}, [player, video]);

	// A new size or new edits: the picture on screen is drawn again from its texture.
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const renderer = rendererRef.current;
		if (!canvas || width === 0) return;
		const pixels = { width: backingSize(width, region.width), height: backingSize(height, region.height) };
		if (canvas.width !== pixels.width) canvas.width = pixels.width;
		if (canvas.height !== pixels.height) canvas.height = pixels.height;
		if (renderer?.ready) draw(renderer, canvas, { doc, region, original }, frameTime.current);
	}, [width, height, doc, region, original]);

	return (
		<div className="stage-picture relative size-full bg-black">
			{video && <canvas ref={canvasRef} className="absolute inset-0 size-full md:rounded-[3px]" />}
			{children}
		</div>
	);
}

/** The crop frame over the whole picture, bound to the video's document. */
function VideoCropOverlay({
	editing,
	crop,
	scale,
	bounds,
}: {
	editing: PictureEditing;
	crop: Rect;
	scale: number;
	bounds: Size;
}) {
	return (
		<CropOverlay
			crop={crop}
			scale={scale}
			bounds={bounds}
			ratio={cropRatio(editing.aspect, bounds)}
			onChange={(next) => {
				editing.preview((doc) => ({ ...doc, crop: next }));
			}}
			onEnd={editing.settle}
		/>
	);
}

/**
 * The picture on screen, from a menu by the time: downloaded or opened in the image editor, as
 * the preview shows it (edits, text, subtitles drawn in) or as the video has it.
 */
function CaptureMenu({
	file,
	doc,
	subtitles,
}: {
	file: File;
	doc: ImageDoc;
	/** Whether the video has subtitles to offer, and whether they show. */
	subtitles: { offered: boolean; shown: boolean };
}) {
	const setCaptured = useCapturedSubtitles((state) => state.setCaptured);
	const video = useVideoDoc();
	const subtitleDoc = useSubtitleDoc();
	const fonts = useSubtitleProject((state) => state.fonts);
	const upright = usePlayback((state) => state.details?.video ?? null);
	const navigate = useNavigate();
	const open = useSession((state) => state.open);
	const [busy, setBusy] = useState(false);
	const run = (source: CaptureSource, action: CaptureAction) => {
		setBusy(true);
		const time = usePlayback.getState().time;
		usePlayback.getState().pause();
		const job = subtitles.offered ? { doc: subtitleDoc, title: file.name.replace(/\.[^.]+$/, ''), fonts } : null;
		const burn = subtitles.shown ? job : null;
		// As shown: the picture as the preview draws it, subtitles and fade included.
		const shown = async () => {
			if (!upright) throw new Error('No picture');
			const fade = fadeOf(video);
			const level =
				fade.in <= 0 && fade.out <= 0
					? 1
					: fadeLevel(fade, toOutput(keptRanges(video), time) / speedOf(video), videoLength(video));
			return captureShown(file, time, { picture: doc, upright, subtitles: burn, level });
		};
		// Opened in the image editor, the picture as shown keeps the edits adjustable: the video's
		// picture goes with the edits as the editor's own, and its subtitles beside it.
		const taken = source === 'shown' && action === 'download' ? shown() : capturePicture(file, time);
		void taken
			.then(async (picture) => {
				if (action === 'download') {
					download(picture, picture.name);
					return;
				}
				if (source === 'shown') {
					carryEdits(picture, doc, time);
					// The video's subtitles go along, to be turned on or off in the image editor.
					setCaptured(
						job
							? { picture, subtitled: await withSubtitles(picture, job, time), shown: subtitles.shown }
							: null,
					);
				} else setCaptured(null);
				const kind = await open([picture], 'image');
				if (kind) await navigate({ to: EDITORS[kind].path });
			})
			.catch(() => undefined)
			.finally(() => {
				setBusy(false);
			});
	};
	return <CapturePopover busy={busy} onRun={run} />;
}

/**
 * Where the whole picture lies relative to the cropped one on screen, for the subtitles. Once
 * turned or mirrored, they simply cover the picture shown.
 */
function subtitleBox(picture: ImageDoc, crop: Rect, upright: Size, scale: number): CSSProperties {
	if (picture.rotation !== 0 || picture.flipX || picture.flipY || picture.angle) return { inset: 0 };
	return {
		left: -crop.x * scale,
		top: -crop.y * scale,
		width: upright.width * scale,
		height: upright.height * scale,
	};
}

/**
 * Black over the picture during the fades, as dark as the export will be at this moment. Follows
 * playback on its own, and draws again only when its darkness changes.
 */
function FadeVeil() {
	const doc = useVideoDoc();
	const fade = fadeOf(doc);
	const ranges = useMemo(() => keptRanges(doc), [doc]);
	const length = videoLength(doc);
	const speed = speedOf(doc);
	const level = usePlayback((state) =>
		fade.in <= 0 && fade.out <= 0 ? 1 : fadeLevel(fade, toOutput(ranges, state.time) / speed, length),
	);
	if (level >= 1) return null;
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 md:rounded-[3px] bg-black"
			style={{ opacity: 1 - level }}
		/>
	);
}

/** The subtitles at the moment playing, following it on their own. */
function PlayingSubtitles(props: Omit<ComponentProps<typeof SubtitleLayer>, 'time'>) {
	const time = usePlayback((state) => state.time);
	return <SubtitleLayer {...props} time={time} />;
}

/**
 * The video playing as edited, with its sound track of choice and its subtitles, including the
 * edits made in the subtitle editor. With the crop tool, the whole picture shows with the crop
 * frame on top. Shares its player with the subtitle editor: going from one to the other keeps the
 * moment and the tracks.
 */
export function VideoPreview({
	opened,
	editing,
	cropping,
	overlays,
	onEditText,
	subtitles,
}: {
	opened: OpenedFile;
	editing: PictureEditing;
	cropping: boolean;
	/** Given while the text or sticker tool is open. */
	overlays?: OverlayEditing;
	onEditText?: () => void;
	/** Whether subtitles were turned on or off in the player's bar; null until then. */
	subtitles: boolean | null;
}) {
	const video = usePlayback((state) => state.details?.video ?? null);
	const projectReady = useSubtitleProject((state) => state.file === opened.file && state.status === 'ready');
	const fonts = useSubtitleProject((state) => state.fonts);
	const doc = useSubtitleDoc();
	const comparing = useShowsOriginal();
	const originalRef = useRef<HTMLCanvasElement>(null);
	const shown = useSubtitlesShown(opened.file, subtitles);

	const picture = editing.doc;
	const upright = video ?? { width: 16, height: 9 };
	const bounds = orientedSize(upright, picture.rotation);
	const crop = effectiveCrop(picture, upright);
	const region: Rect = cropping ? { x: 0, y: 0, ...bounds } : crop;
	// Text and stickers shown at this moment; the list changes only when one appears or goes.
	const visibleKey = usePlayback((state) =>
		picture.overlays
			.filter((overlay) => shownAt(overlay, state.time))
			.map((overlay) => overlay.id)
			.join(' '),
	);
	const visible = useMemo(
		() => picture.overlays.filter((overlay) => visibleKey.split(' ').includes(overlay.id)),
		[picture.overlays, visibleKey],
	);

	useEffect(
		() => () => {
			usePlayback.getState().pause();
		},
		[],
	);

	return (
		<div className="relative size-full min-h-0">
			<ZoomStage width={region.width} height={region.height} compare={!cropping} margin={8}>
				{(scale) => (
					<EditedPicture
						region={region}
						width={region.width * scale}
						height={region.height * scale}
						doc={cropping ? wholePictureDoc(picture, crop, bounds) : picture}
						original={comparing ? originalRef : null}
					>
						{!cropping && picture.overlays.length > 0 && (
							<OverlayLayer
								overlays={visible}
								width={region.width * scale}
								height={region.height * scale}
								editing={overlays}
								onEditText={onEditText}
							/>
						)}
						{!cropping && <FadeVeil />}
						{comparing && <OriginalPicture ref={originalRef} />}
						{shown && projectReady && (
							// Subtitles belong to the whole picture: they lie over it and the crop cuts them,
							// as when they are burnt in, rather than being squeezed into the crop. While
							// cropping, the whole picture shows, and they lie on it under the frame.
							<div className="pointer-events-none absolute inset-0 overflow-hidden md:rounded-[3px]">
								<div
									className="absolute"
									style={subtitleBox(
										picture,
										cropping ? { x: 0, y: 0, ...upright } : crop,
										upright,
										scale,
									)}
								>
									<PlayingSubtitles
										doc={doc}
										title={opened.file.name.replace(/\.[^.]+$/, '')}
										video={upright}
										fonts={fonts}
									/>
								</div>
							</div>
						)}
						{cropping && <CroppedLayers overlays={visible} crop={crop} scale={scale} />}
						{cropping && <VideoCropOverlay editing={editing} crop={crop} scale={scale} bounds={bounds} />}
					</EditedPicture>
				)}
			</ZoomStage>
		</div>
	);
}

/** The subtitle track the player can show: the current one, unless it was left out of the video. */
function useOfferedSubtitles(file: File): TrackKey | null {
	const current = useSubtitleProject((state) => state.current);
	const leftOut = useLeftOut(file);
	return current !== null && leftOut.has(`subtitle-${current}`) ? null : current;
}

/**
 * Edited subtitles show, and so do tracks the file marks as default, as players do, unless turned
 * off or left out of the video.
 */
function useSubtitlesShown(file: File, choice: boolean | null): boolean {
	const tracks = useProjectTracks();
	const current = useOfferedSubtitles(file);
	if (current === null) return false;
	const currentTrack = tracks.find((track) => track.key === current);
	return choice ?? Boolean(currentTrack && (currentTrack.edited || currentTrack.info?.default));
}

/**
 * The player's bar of the video editor, over its timeline: the sound and subtitle tracks, a
 * capture of the picture, the comparison with the original and the zoom.
 */
export function VideoPlayerBar({
	opened,
	picture,
	cropping,
	subtitles,
	onSubtitles,
}: {
	opened: OpenedFile;
	picture: ImageDoc;
	cropping: boolean;
	subtitles: boolean | null;
	onSubtitles: (shown: boolean) => void;
}) {
	const projectReady = useSubtitleProject((state) => state.file === opened.file && state.status === 'ready');
	const shown = useSubtitlesShown(opened.file, subtitles);
	const offered = useOfferedSubtitles(opened.file);
	return (
		<PlayerControls
			seek={false}
			frameRate={opened.info?.video?.fps ?? 30}
			time={
				<>
					<VideoTime />
					<span className="bg-line ml-1.5 h-5 w-px flex-none max-md:hidden" aria-hidden="true" />
					<CaptureMenu
						file={opened.file}
						doc={picture}
						subtitles={{ offered: projectReady && offered !== null, shown: shown && projectReady }}
					/>
				</>
			}
			fit={<VideoFit />}
		>
			<VolumeControl />
			<AudioTrackMenu />
			{projectReady && <SubtitleMenu file={opened.file} shown={shown} onShown={onSubtitles} />}
			<span className="bg-line mx-1.5 h-5 w-px max-md:hidden" aria-hidden="true" />
			{!cropping && <CompareButtons className="max-md:hidden" />}
		</PlayerControls>
	);
}
