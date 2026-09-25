/**
 * Subtitles burned into the pictures of an export: text drawn by libass in a worker, like the
 * preview draws it, PGS pictures where the disc places them.
 */
import defaultFont from 'jassub/dist/default.woff2?url';
import modernWasm from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import wasm from 'jassub/dist/wasm/jassub-worker.wasm?url';
import type { BurnRequest, BurnResponse } from '@/media/burn-protocol';
import type { Size } from '../image/document';
import { cuesAt, type SubtitleDoc } from '../subtitles/document';
import { toAssScript } from '../subtitles/formats';
import { pictureBitmap } from '../subtitles/pgs';

/** Where the picture the subtitles lie on falls on the exported picture, in pixels. */
export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SubtitleBurner {
	/** Draws the subtitles shown at `time`, in source seconds. */
	draw: (context: OffscreenCanvasRenderingContext2D, time: number) => Promise<void>;
	dispose: () => void;
}

export interface BurnJob {
	doc: SubtitleDoc;
	/** Title of the script made from subtitles other than ASS. */
	title: string;
	/** Fonts the subtitles use, such as those embedded in the video. */
	fonts: readonly Uint8Array[];
}

export async function createBurner(job: BurnJob, video: Size, box: Box): Promise<SubtitleBurner> {
	if (job.doc.format === 'pgs') return pgsBurner(job.doc, box);
	return textBurner(toAssScript(job.doc, job.title, video), job.fonts, box);
}

function pgsBurner(doc: SubtitleDoc, box: Box): SubtitleBurner {
	const size = doc.pgsSize ?? { width: 1920, height: 1080 };
	const sx = box.width / size.width;
	const sy = box.height / size.height;
	return {
		async draw(context, time) {
			// The last line starting wins: PGS shows one composition at a time.
			const picture = cuesAt(doc, time * 1000).findLast((line) => line.picture)?.picture;
			if (!picture) return;
			const bitmap = await pictureBitmap(picture);
			if (!bitmap || bitmap.width === 0) return;
			context.imageSmoothingQuality = 'high';
			context.drawImage(
				bitmap,
				box.x + picture.x * sx,
				box.y + picture.y * sy,
				picture.width * sx,
				picture.height * sy,
			);
		},
		dispose() {},
	};
}

async function textBurner(script: string, fonts: readonly Uint8Array[], box: Box): Promise<SubtitleBurner> {
	const { default: JASSUB } = await import('jassub');
	JASSUB._test();
	const worker = new Worker(new URL('../../workers/burn.worker.ts', import.meta.url), {
		type: 'module',
		name: 'vixely-burn',
	});
	const pending = new Map<number, (response: Extract<BurnResponse, { type: 'rendered' }>) => void>();
	let next = 0;
	const opened = new Promise<void>((resolve, reject) => {
		worker.onmessage = ({ data }: MessageEvent<BurnResponse>) => {
			if (data.type === 'opened') resolve();
			else if (data.type === 'failed') reject(new Error(data.message));
			else {
				pending.get(data.id)?.(data);
				pending.delete(data.id);
			}
		};
		worker.onerror = (event) => {
			reject(new Error(event.message));
		};
	});
	const width = Math.max(1, Math.round(box.width));
	const height = Math.max(1, Math.round(box.height));
	const open: BurnRequest = {
		type: 'open',
		script,
		// The fallback font (Liberation Sans, metric-compatible with Arial), as the preview has it.
		fonts: [new URL(defaultFont, location.href).href, ...fonts],
		wasmUrl: new URL(JASSUB._supportsSIMD ? modernWasm : wasm, location.href).href,
		width,
		height,
	};
	worker.postMessage(open);
	try {
		await opened;
	} catch (error) {
		worker.terminate();
		throw error;
	}

	let shown: ImageBitmap | null = null;
	return {
		async draw(context, time) {
			const id = next++;
			const response = await new Promise<Extract<BurnResponse, { type: 'rendered' }>>((resolve) => {
				pending.set(id, resolve);
				worker.postMessage({ type: 'render', id, time } satisfies BurnRequest);
			});
			if (!response.same) {
				shown?.close();
				shown = response.bitmap;
			}
			if (shown) context.drawImage(shown, box.x, box.y, box.width, box.height);
		},
		dispose() {
			shown?.close();
			worker.terminate();
		},
	};
}
