import { useNavigate } from '@tanstack/react-router';
import { Camera, Captions, Eye } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CropOverlay } from '@/editor/CropOverlay';
import { PlayerControls, PlayerMenu } from '@/editor/PlayerControls';
import { EDITORS } from '@/editors/registry';
import { languageName } from '@/lib/language';
import { usePlayback } from '@/media/playback';
import { type OpenedFile, useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { IconButton } from '@/ui/Button';
import { useBoxSize } from '@/ui/use-box-size';
import { effectiveCrop, type ImageDoc, orientedSize, type Rect, type Size } from '../image/document';
import type { PictureEditing } from '../image/editing';
import { ImageRenderer } from '../image/renderer';
import { cropRatio } from '../image/store';
import { type TrackKey, useProjectTracks, useSubtitleProject } from '../subtitles/project';
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
					label: `${track.info ? [languageName(track.info.language), track.info.name].filter(Boolean).join(', ') : m.subs_new_track()}${track.edited ? ` (${m.subs_track_edited()})` : ''}`,
				})),
			]}
			onChange={(value) => {
				if (value === OFF) {
					onShown(false);
					return;
				}
				const key: TrackKey = value === 'new' ? 'new' : Number(value);
				choose(key);
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
		const ratio = Math.min(window.devicePixelRatio || 1, 2);
		const pixels = {
			width: Math.max(1, Math.round(width * ratio)),
			height: Math.max(1, Math.round(height * ratio)),
		};
		if (canvas.width !== pixels.width) canvas.width = pixels.width;
		if (canvas.height !== pixels.height) canvas.height = pixels.height;
		if (renderer?.ready) renderer.render(doc, { region, original });
	}, [width, height, doc, region, original]);

	return (
		<div
			className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-black shadow-[0_0_0_1px_var(--line)]"
			style={{ width, height }}
		>
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
						carryEdits(picture, doc);
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

/** Held down, the picture shows as it comes, without the edits. */
function CompareButton({ comparing, onCompare }: { comparing: boolean; onCompare: (comparing: boolean) => void }) {
	return (
		<button
			type="button"
			aria-label={m.compare_hold()}
			title={m.compare_hold()}
			aria-pressed={comparing}
			onPointerDown={() => {
				onCompare(true);
			}}
			onPointerUp={() => {
				onCompare(false);
			}}
			onPointerLeave={() => {
				onCompare(false);
			}}
			onKeyDown={(event) => {
				if (event.key === 'Enter') onCompare(true);
			}}
			onKeyUp={() => {
				onCompare(false);
			}}
			className="text-ink-2 hover:bg-surface hover:text-ink aria-pressed:bg-surface-2 aria-pressed:text-ink grid size-8 place-items-center rounded-sm transition-colors select-none"
		>
			<Eye size={17} aria-hidden="true" />
		</button>
	);
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
}: {
	opened: OpenedFile;
	editing: PictureEditing;
	cropping: boolean;
}) {
	const time = usePlayback((state) => state.time);
	const video = usePlayback((state) => state.details?.video ?? null);
	const projectReady = useSubtitleProject((state) => state.file === opened.file && state.status === 'ready');
	const fonts = useSubtitleProject((state) => state.fonts);
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const doc = useSubtitleDoc();
	const areaRef = useRef<HTMLDivElement>(null);
	const area = useBoxSize(areaRef);
	const [choice, setChoice] = useState<boolean | null>(null);
	const [comparing, setComparing] = useState(false);
	const currentTrack = tracks.find((track) => track.key === current);
	// Edited subtitles show, and so do tracks the file marks as default, as players do.
	const shown = choice ?? Boolean(currentTrack && (currentTrack.edited || currentTrack.info?.default));

	const picture = editing.doc;
	const upright = video ?? { width: 16, height: 9 };
	const bounds = orientedSize(upright, picture.rotation);
	const crop = effectiveCrop(picture, upright);
	const region: Rect = cropping ? { x: 0, y: 0, ...bounds } : crop;
	const scale = area.width && area.height ? Math.min(area.width / region.width, area.height / region.height) : 0;
	const width = Math.floor(region.width * scale);
	const height = Math.floor(region.height * scale);

	useEffect(
		() => () => {
			usePlayback.getState().pause();
		},
		[],
	);

	return (
		<div className="flex size-full min-h-0 flex-col gap-2">
			<div ref={areaRef} className="relative min-h-0 flex-1">
				<EditedPicture region={region} width={width} height={height} doc={picture} original={comparing}>
					{width > 0 && shown && projectReady && !cropping && (
						// Subtitles belong to the whole picture: they lie over it and the crop cuts them,
						// as when they are burnt in, rather than being squeezed into the crop.
						<div className="absolute inset-0 overflow-hidden rounded-[3px]">
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
					{cropping && width > 0 && (
						<VideoCropOverlay editing={editing} crop={crop} scale={scale} bounds={bounds} />
					)}
				</EditedPicture>
			</div>
			<PlayerControls>
				{projectReady && <SubtitleMenu shown={shown} onShown={setChoice} />}
				<CompareButton comparing={comparing} onCompare={setComparing} />
				<CaptureButton file={opened.file} doc={picture} />
			</PlayerControls>
		</div>
	);
}
