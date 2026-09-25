/**
 * Pictures along a video for its timeline, off the main thread. Zoomed out, each one is a key
 * frame: showing one takes a single decoded picture, so a whole film fills its timeline in
 * moments. Zoomed in close, each slot shows its own picture.
 */
import { ALL_FORMATS, BlobSource, CanvasSink, EncodedPacketSink, Input, type InputVideoTrack } from 'mediabunny';
import type { ThumbnailMessage, ThumbnailRequest } from '@/media/thumbnails-protocol';

function post(message: ThumbnailMessage) {
	self.postMessage(message, { transfer: message.type === 'picture' ? [message.bitmap] : [] });
}

interface Opened {
	packets: EncodedPacketSink;
	canvases: CanvasSink;
	start: number;
}

/** The video, once open: requests that come before wait for it. */
let opened: Promise<Opened> | null = null;
let generation = 0;
/** Longest stretch, in seconds, over which every slot gets its exact picture. */
const EXACT_SPAN = 20;

/** Pictures already sent, by time: the page keeps them. */
const sent = new Set<number>();

async function open(file: File, height: number): Promise<Opened> {
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
	const track: InputVideoTrack | null = await input.getPrimaryVideoTrack();
	if (!track || !(await track.canDecode())) throw new Error('No decodable video');
	return {
		packets: new EncodedPacketSink(track),
		canvases: new CanvasSink(track, { height, fit: 'contain', poolSize: 1 }),
		start: await track.getFirstTimestamp(),
	};
}

async function want(run: number, times: number[]) {
	if (!opened) return;
	const { packets, canvases, start } = await opened;
	// Zoomed in close, each slot shows its own picture; further out, the key frame before it,
	// which takes one decoded picture per slot.
	const exact = times.length > 0 && Math.max(...times) - Math.min(...times) <= EXACT_SPAN;
	const keys: number[] = [];
	for (const time of exact ? [] : times) {
		// oxlint-disable-next-line no-await-in-loop -- packet lookups are index reads, one after the other
		const key = await packets.getKeyPacket(Math.max(start, time), { metadataOnly: true });
		keys.push(key?.timestamp ?? start);
	}
	if (exact) keys.push(...times.map((time) => Math.max(start, time)));
	if (run !== generation) return;
	post({ type: 'keys', generation: run, times, keys });
	const missing = [...new Set(keys)].filter((key) => !sent.has(key)).toSorted((a, b) => a - b);
	// One picture per time asked, in the same order.
	let index = 0;
	for await (const frame of canvases.canvasesAtTimestamps(missing)) {
		const key = missing[index];
		index += 1;
		if (run !== generation) return;
		if (!frame || key === undefined) continue;
		sent.add(key);
		post({ type: 'picture', key, bitmap: await createImageBitmap(frame.canvas) });
	}
}

self.onmessage = (event: MessageEvent<ThumbnailRequest>) => {
	const request = event.data;
	if (request.type === 'open') {
		opened = open(request.file, request.height);
		opened.catch(() => {
			post({ type: 'failed' });
		});
		return;
	}
	generation = request.generation;
	want(request.generation, request.times).catch(() => undefined);
};
