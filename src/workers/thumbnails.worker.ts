/**
 * Pictures along a video for its timeline, off the main thread. Zoomed out, each one is a key
 * frame: showing one takes a single decoded picture, so a whole film fills its timeline in
 * moments. Zoomed in close, each slot shows its own picture.
 */
import {
	ALL_FORMATS,
	BlobSource,
	CanvasSink,
	EncodedPacketSink,
	Input,
	type InputVideoTrack,
	type WrappedCanvas,
} from 'mediabunny';
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
/** Black key frames, and the later key frame of their slot shown instead. */
const replaced = new Map<number, number>();

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

/** Key frames tried after a black one, at most. */
const LATER_TRIES = 4;

const probe = new OffscreenCanvas(16, 9);
const probeContext = probe.getContext('2d', { willReadFrequently: true });

/** Whether a picture is all but black, as at the start of a film or after a fade. */
function isBlack(canvas: OffscreenCanvas | HTMLCanvasElement): boolean {
	if (!probeContext) return false;
	probeContext.drawImage(canvas, 0, 0, probe.width, probe.height);
	const { data } = probeContext.getImageData(0, 0, probe.width, probe.height);
	let brightest = 0;
	for (let index = 0; index < data.length; index += 4) {
		const luma = 0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
		brightest = Math.max(brightest, luma);
	}
	return brightest < 24;
}

/**
 * A later key frame of the same slot that isn't black, to show in place of a black one: the
 * filmstrip tells the passage by its pictures. Null when there is none before `until`.
 */
async function lighterFrame(
	packets: EncodedPacketSink,
	canvases: CanvasSink,
	from: number,
	until: number | undefined,
): Promise<WrappedCanvas | null> {
	if (until === undefined) return null;
	let packet = await packets.getKeyPacket(from, { metadataOnly: true });
	for (let tries = 0; packet && tries < LATER_TRIES; tries += 1) {
		// oxlint-disable-next-line no-await-in-loop -- one key frame after the other
		packet = await packets.getNextKeyPacket(packet, { metadataOnly: true });
		if (!packet || packet.timestamp >= until) return null;
		// oxlint-disable-next-line no-await-in-loop
		const frame = await canvases.getCanvas(packet.timestamp);
		if (frame && !isBlack(frame.canvas)) return frame;
	}
	return null;
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
		const found = key?.timestamp ?? start;
		keys.push(replaced.get(found) ?? found);
	}
	if (exact) keys.push(...times.map((time) => Math.max(start, time)));
	if (run !== generation) return;
	post({ type: 'keys', generation: run, times, keys });
	const missing = [...new Set(keys)].filter((key) => !sent.has(key)).toSorted((a, b) => a - b);
	// How far each key frame's slot reaches: a black one gives way to a later key frame within it.
	const reach = new Map<number, number>();
	if (!exact) {
		times.forEach((time, index) => {
			const step = (times[index + 1] ?? time + (time - (times[index - 1] ?? time))) - time;
			const key = keys[index];
			if (key !== undefined) reach.set(key, Math.max(reach.get(key) ?? 0, time + step));
		});
	}
	// One picture per time asked, in the same order.
	let index = 0;
	for await (const frame of canvases.canvasesAtTimestamps(missing)) {
		const key = missing[index];
		index += 1;
		if (run !== generation) return;
		if (!frame || key === undefined) continue;
		if (!exact && isBlack(frame.canvas)) {
			// oxlint-disable-next-line no-await-in-loop -- rarely more than the first slot
			const later = await lighterFrame(packets, canvases, key, reach.get(key));
			if (later) {
				// Kept under its own time: zoomed in, the black picture still shows where it is.
				replaced.set(key, later.timestamp);
				sent.add(later.timestamp);
				const moved = times.filter((_, at) => keys[at] === key);
				post({ type: 'keys', generation: run, times: moved, keys: moved.map(() => later.timestamp) });
				post({ type: 'picture', key: later.timestamp, bitmap: await createImageBitmap(later.canvas) });
				continue;
			}
		}
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
