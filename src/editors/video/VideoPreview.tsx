import { useNavigate } from '@tanstack/react-router';
import { Camera, Captions } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CropOverlay } from '@/editor/CropOverlay';
import type { OverlayEditing } from '@/editor/overlays/editing';
import { shownAt } from '@/editor/overlays/model';
import { OverlayLayer } from '@/editor/overlays/OverlayLayer';
import { PlayerControls, PlayerMenu } from '@/editor/PlayerControls';
import { backingSize, useStageZoom, ZoomStage } from '@/editor/ZoomStage';
import { EDITORS } from '@/editors/registry';
import { trackName } from '@/lib/language';
import { usePlayback } from '@/media/playback';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { effectiveCrop, type ImageDoc, orientedSize, type Rect, type Size } from '../image/document';
import type { PictureEditing } from '../image/editing';
import { ImageRenderer } from '../image/renderer';
import { cropRatio } from '../image/store';
import { isAdded, useProjectTracks, useSubtitleProject } from '../subtitles/project';
import { useSubtitleDoc } from '../subtitles/store';
import { SubtitleLayer } from '../subtitles/SubtitleViewer';
import { capturePicture, carryEdits } from './capture';

const OFF = 'off';

/** Which subtitle track shows over the video: the one edited in the subtitle editor, marked so. */
function SubtitleMenu({ shown, onShown }: { shown: boolean; onShown: (shown: boolean) => void }) {
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const choose = useSubtitleProject((state) => state.choose);
	const options = tracks.filter((track) => track.original && (track.key !== 'new' || track.edited));
	if (options.length === 0) return null;
	return (
		<PlayerMenu
			icon={Captions}
			label={m.player_subtitles()}
			value={shown && current !== null ? String(current) : OFF}
			options={[
				{ value: OFF, label: m.player_subtitles_off() },
				...options.map((track) => ({
					value: String(track.key),
					label: `${track.info ? trackName(track.info.language, track.info.name) : m.subs_new_track()}${track.edited && !isAdded(track.key) ? ` (${m.subs_track_edited()})` : ''}`,
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
	/** Shows the picture as it comes, to compare. */
	original: boolean;
	children?: ReactNode;
}) {
	const player = usePlayback((state) => state.player);
	const video = usePlayback((state) => state.details?.video ?? null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rendererRef = useRef<ImageRenderer | null>(null);
	// Read by the painter, which draws pictures as playback delivers them.
	const shown = useRef({ doc, region, original });
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
		player.attach(canvas, (sample) => {
			renderer.setFrame(
				sample.toCanvasImageSource(),
				{ width: sample.squarePixelWidth, height: sample.squarePixelHeight },
				sample.rotation,
			);
			renderer.render(shown.current.doc, { region: shown.current.region, original: shown.current.original });
		});
		return () => {
			player.attach(null);
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
		if (renderer?.ready) renderer.render(doc, { region, original });
	}, [width, height, doc, region, original]);

	return (
		<div className="relative size-full rounded-[3px] bg-black shadow-[0_1px_3px_rgb(0_0_0/0.18),0_12px_40px_-12px_rgb(0_0_0/0.35)]">
			{video && <canvas ref={canvasRef} className="absolute inset-0 size-full rounded-[3px]" />}
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

/** Opens the picture on screen in the image editor, with the video's crop, turns and colours. */
function CaptureButton({ file, doc }: { file: File; doc: ImageDoc }) {
	const navigate = useNavigate();
	const open = useSession((state) => state.open);
	const [busy, setBusy] = useState(false);
	return (
		<IconButton
			label={m.capture_picture()}
			disabled={busy}
			onClick={() => {
				setBusy(true);
				const time = usePlayback.getState().time;
				usePlayback.getState().pause();
				void capturePicture(file, time)
					.then(async (picture) => {
						carryEdits(picture, doc, time);
						const kind = await open([picture], 'image');
						if (kind) await navigate({ to: EDITORS[kind].path });
					})
					.catch(() => undefined)
					.finally(() => {
						setBusy(false);
					});
			}}
		>
			<Camera size={17} />
		</IconButton>
	);
}

/**
 * Where the whole picture lies relative to the cropped one on screen, for the subtitles. Once
 * turned or mirrored, they simply cover the picture shown.
 */
function subtitleBox(picture: ImageDoc, crop: Rect, upright: Size, scale: number): CSSProperties {
	if (picture.rotation !== 0 || picture.flipX || picture.flipY) return { inset: 0 };
	return {
		left: -crop.x * scale,
		top: -crop.y * scale,
		width: upright.width * scale,
		height: upright.height * scale,
	};
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
}: {
	opened: OpenedFile;
	editing: PictureEditing;
	cropping: boolean;
	/** Given while the text or sticker tool is open. */
	overlays?: OverlayEditing;
	onEditText?: () => void;
}) {
	const time = usePlayback((state) => state.time);
	const video = usePlayback((state) => state.details?.video ?? null);
	const projectReady = useSubtitleProject((state) => state.file === opened.file && state.status === 'ready');
	const fonts = useSubtitleProject((state) => state.fonts);
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const doc = useSubtitleDoc();
	const [choice, setChoice] = useState<boolean | null>(null);
	const comparing = useStageZoom((state) => state.comparing);
	const currentTrack = tracks.find((track) => track.key === current);
	// Edited subtitles show, and so do tracks the file marks as default, as players do.
	const shown = choice ?? Boolean(currentTrack && (currentTrack.edited || currentTrack.info?.default));

	const picture = editing.doc;
	const upright = video ?? { width: 16, height: 9 };
	const bounds = orientedSize(upright, picture.rotation);
	const crop = effectiveCrop(picture, upright);
	const region: Rect = cropping ? { x: 0, y: 0, ...bounds } : crop;
	// Text and stickers shown at this moment; the list changes only when one appears or goes.
	const visibleKey = picture.overlays
		.filter((overlay) => shownAt(overlay, time))
		.map((overlay) => overlay.id)
		.join(' ');
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
		<div className="flex size-full min-h-0 flex-col gap-2">
			<div className="relative min-h-0 flex-1">
				<ZoomStage width={region.width} height={region.height} compare>
					{(scale) => (
						<EditedPicture
							region={region}
							width={region.width * scale}
							height={region.height * scale}
							doc={picture}
							original={comparing}
						>
							{!cropping && !comparing && picture.overlays.length > 0 && (
								<OverlayLayer
									overlays={visible}
									width={region.width * scale}
									height={region.height * scale}
									editing={overlays}
									onEditText={onEditText}
								/>
							)}
							{shown && projectReady && !cropping && (
								// Subtitles belong to the whole picture: they lie over it and the crop cuts them,
								// as when they are burnt in, rather than being squeezed into the crop.
								<div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]">
									<div className="absolute" style={subtitleBox(picture, crop, upright, scale)}>
										<SubtitleLayer
											doc={doc}
											time={time}
											title={opened.file.name.replace(/\.[^.]+$/, '')}
											video={upright}
											fonts={fonts}
										/>
									</div>
								</div>
							)}
							{cropping && (
								<VideoCropOverlay editing={editing} crop={crop} scale={scale} bounds={bounds} />
							)}
						</EditedPicture>
					)}
				</ZoomStage>
			</div>
			<PlayerControls>
				{projectReady && <SubtitleMenu shown={shown} onShown={setChoice} />}
				<CaptureButton file={opened.file} doc={picture} />
			</PlayerControls>
		</div>
	);
}
