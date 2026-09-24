/**
 * Rewrites Matroska and MP4 files with vixely-subs: the source is read synchronously (FileReaderSync),
 * which only a worker can do, and the new file goes back to the page chunk by chunk, each one
 * asked for once the previous one is written. See `src/media/remux.ts`.
 */
import type { RemuxJob, RemuxRequest, RemuxResponse } from '@/media/remux';
import { loadSubs } from '@/wasm/subs';

type Remuxer = InstanceType<Awaited<ReturnType<typeof loadSubs>>['Remuxer']>;

let remuxer: Remuxer | null = null;

function post(message: RemuxResponse, transfer: Transferable[] = []) {
	self.postMessage(message, { transfer });
}

async function start(job: RemuxJob) {
	const subs = await loadSubs();
	const plan = new subs.RemuxPlan();
	for (const stream of job.streams) {
		plan.add_stream(stream.codec, stream.private, stream.starts, stream.durations, stream.offsets, stream.data);
	}
	for (const choice of job.choices) {
		const flag = (value: boolean | undefined) => (value === undefined ? -1 : value ? 1 : 0);
		plan.choose(
			choice.number,
			choice.keep,
			choice.language,
			choice.name,
			flag(choice.default),
			flag(choice.forced),
			choice.stream ?? -1,
		);
	}
	for (const track of job.added) {
		// Any random number identifies a track; 53 bits are plenty.
		const uid = Math.floor(Math.random() * 2 ** 52) + 1;
		plan.add_track(track.stream, track.language, track.name, track.default, track.forced, uid);
	}
	const reader = new FileReaderSync();
	const { file } = job;
	const read = (offset: number, length: number) =>
		new Uint8Array(reader.readAsArrayBuffer(file.slice(offset, offset + length)));
	let last = 0;
	remuxer = new subs.Remuxer(read, file.size, plan, (share: number) => {
		if (share - last < 0.01 && share < 1) return;
		last = share;
		post({ type: 'planning', share });
	});
	plan.free();
	post({ type: 'size', total: remuxer.total() });
}

function next() {
	if (!remuxer) throw new Error('Nothing to write.');
	const data = remuxer.next_chunk();
	if (data.length === 0) {
		remuxer.free();
		remuxer = null;
		post({ type: 'done' });
		return;
	}
	post({ type: 'chunk', data }, [data.buffer]);
}

self.onmessage = (event: MessageEvent<RemuxRequest>) => {
	const message = event.data;
	const run = message.type === 'start' ? start(message.job) : Promise.resolve().then(next);
	run.catch((error: unknown) => {
		post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
	});
};
