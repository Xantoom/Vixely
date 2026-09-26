import { useNavigate } from '@tanstack/react-router';
import { Download, ImageUp, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PanelTitle } from '@/editor/EditorLayout';
import { saveFile } from '@/editors/image/export';
import { EDITORS } from '@/editors/registry';
import { useSession } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { Button } from '@/ui/Button';
import { FrameComposer } from './compose';
import { frameAt, frameKey, frameLayout, type OutputFrame } from './document';
import type { GifEngine } from './engine';
import { useGifDoc, useGifEditor } from './store';

/** Side of a frame's thumbnail, in CSS pixels. */
const THUMB = 88;

/** The frame at `index` as a PNG, at the full size of the output. */
async function framePng(engine: GifEngine, frame: OutputFrame, index: number, name: string): Promise<File | null> {
	const { source } = engine;
	if (!source) return null;
	const doc = useGifEditor.getState().history.present;
	const layout = frameLayout(doc, source, null);
	const picture = await source.fetch(frame.source);
	if (!(picture instanceof ImageBitmap || picture instanceof OffscreenCanvas || picture instanceof HTMLCanvasElement))
		return null;
	// A video's preview pictures are small: the frame is read again at full size for the file.
	let full: TexImageSource = picture;
	if (!source.timing) {
		for await (const read of source.render([frame.source], 1)) {
			full = read;
			break;
		}
	}
	const canvas = new OffscreenCanvas(layout.width, layout.height);
	const context = canvas.getContext('2d');
	if (!context) return null;
	const composer = new FrameComposer();
	composer.draw(context, full, source, doc, layout, { time: frame.start, length: engine.length });
	composer.dispose();
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	const base = name.replace(/\.[^.]+$/, '');
	return new File([blob], `${base} frame ${index + 1}.png`, { type: 'image/png', lastModified: Date.now() });
}

/** One frame's thumbnail, drawn when it scrolls into view. */
function Thumbnail({
	engine,
	frame,
	composer,
}: {
	engine: GifEngine;
	frame: OutputFrame;
	composer: FrameComposer | null;
}) {
	const doc = useGifDoc();
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		const { source } = engine;
		if (!canvas || !source || !composer) return;
		let live = true;
		const observer = new IntersectionObserver((entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			void source.fetch(frame.source).then((picture) => {
				const context = canvas.getContext('2d');
				if (!live || !context || !picture) return;
				if (
					!(
						picture instanceof ImageBitmap ||
						picture instanceof HTMLCanvasElement ||
						picture instanceof OffscreenCanvas
					)
				)
					return;
				const layout = frameLayout(doc, source, null);
				const ratio = window.devicePixelRatio || 1;
				const scale = Math.min(THUMB / layout.width, THUMB / layout.height);
				canvas.width = Math.max(1, Math.round(layout.width * scale * ratio));
				canvas.height = Math.max(1, Math.round(layout.height * scale * ratio));
				composer.draw(context, picture, source, doc, layout, { time: frame.start, length: engine.length });
			});
		});
		observer.observe(canvas);
		return () => {
			live = false;
			observer.disconnect();
		};
	}, [engine, frame, composer, doc]);
	return <canvas ref={ref} className="max-h-full max-w-full rounded-[3px]" />;
}

/**
 * Every frame of the output, to look at one by one: go to it, leave it out, save it as a PNG or
 * open it in the image editor.
 */
export function FramesPanel({ engine, fileName }: { engine: GifEngine; fileName: string }) {
	const doc = useGifDoc();
	const apply = useGifEditor((state) => state.apply);
	const playhead = useGifEditor((state) => state.playhead);
	const setPlaying = useGifEditor((state) => state.setPlaying);
	const open = useSession((state) => state.open);
	const navigate = useNavigate();
	const composer = useRef<FrameComposer | null>(null);
	const { frames } = engine;
	const current = frameAt(frames, playhead);
	const index = current ? frames.indexOf(current) : -1;

	if (!composer.current) {
		try {
			composer.current = new FrameComposer();
		} catch {
			// Thumbnails stay blank without WebGL.
		}
	}
	useEffect(
		() => () => {
			composer.current?.dispose();
			composer.current = null;
		},
		[],
	);

	const remove = () => {
		if (!current || frames.length <= 1) return;
		const key = frameKey(current.source);
		apply((doc) => ({ ...doc, removed: [...doc.removed, key] }));
	};

	return (
		<>
			<PanelTitle>{m.tool_frames()}</PanelTitle>
			<div className="flex flex-wrap gap-2">
				<Button onClick={remove} disabled={!current || frames.length <= 1}>
					<Trash2 className="size-4.5" aria-hidden="true" />
					{m.frame_delete()}
				</Button>
				<Button
					disabled={!current}
					onClick={() => {
						if (!current) return;
						void framePng(engine, current, index, fileName).then(async (file) => {
							if (file) await saveFile(file, file.name);
						});
					}}
				>
					<Download className="size-4.5" aria-hidden="true" />
					{m.frame_save()}
				</Button>
				<Button
					disabled={!current}
					onClick={() => {
						if (!current) return;
						setPlaying(false);
						void framePng(engine, current, index, fileName).then(async (file) => {
							if (!file) return;
							const kind = await open([file], 'image');
							if (kind) await navigate({ to: EDITORS[kind].path });
						});
					}}
				>
					<ImageUp className="size-4.5" aria-hidden="true" />
					{m.frame_edit()}
				</Button>
				{doc.removed.length > 0 && (
					<Button
						onClick={() => {
							apply((doc) => ({ ...doc, removed: [] }));
						}}
					>
						<Undo2 className="size-4.5" aria-hidden="true" />
						{m.frames_restore({ count: doc.removed.length })}
					</Button>
				)}
			</div>
			<div
				role="listbox"
				aria-label={m.tool_frames()}
				className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2"
			>
				{frames.map((frame, position) => (
					<button
						key={`${frame.source}-${frame.start}`}
						type="button"
						role="option"
						aria-selected={position === index}
						onClick={() => {
							setPlaying(false);
							engine.seek(frame.start);
						}}
						className="bg-surface aria-selected:bg-ed-soft aria-selected:shadow-[inset_0_0_0_1.5px_var(--ed)] grid gap-1 rounded-sm p-1.5 text-left transition-colors"
					>
						<span className="grid h-[5.5rem] place-items-center">
							<Thumbnail engine={engine} frame={frame} composer={composer.current} />
						</span>
						<span className="text-caption text-muted tabular flex justify-between font-mono">
							<span>{position + 1}</span>
							<span>{Math.round(frame.duration * 1000)} ms</span>
						</span>
					</button>
				))}
			</div>
		</>
	);
}
