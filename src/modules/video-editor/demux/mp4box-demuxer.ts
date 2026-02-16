import { createFile, type ISOFile, type Sample, type Track, type Movie, type MP4BoxBuffer } from 'mp4box';
import type { Demuxer, DemuxedTrack, DemuxedSample } from './demuxer.ts';

const CHUNK_SIZE = 1024 * 1024; // 1MB read chunks

function codecStringFromTrack(track: Track): string {
	return track.codec;
}

function extractCodecDescription(isoFile: ISOFile<unknown, unknown>, track: Track): Uint8Array {
	const trak = isoFile.getTrackById(track.id);
	const stbl = trak?.mdia?.minf?.stbl;
	const stsd = stbl?.stsd;
	if (!stsd) return new Uint8Array(0);

	// For H.264: avcC box, for H.265: hvcC box, for VP9/AV1: codec-specific config
	const entry = stsd.entries?.[0];
	if (!entry) return new Uint8Array(0);

	// Try common description boxes
	for (const boxName of ['avcC', 'hvcC', 'vpcC', 'av1C']) {
		const descBox = (entry as unknown as Record<string, unknown>)[boxName];
		if (descBox && typeof descBox === 'object' && 'data' in (descBox as Record<string, unknown>)) {
			return new Uint8Array((descBox as { data: ArrayBuffer }).data);
		}
	}

	return new Uint8Array(0);
}

export class Mp4boxDemuxer implements Demuxer {
	private isoFile: ISOFile<unknown, unknown> | null = null;
	private file: File | null = null;
	private tracks: DemuxedTrack[] = [];
	private sampleCallbacks = new Map<number, (sample: DemuxedSample) => void>();
	private info: Movie | null = null;

	async open(file: File): Promise<DemuxedTrack[]> {
		this.file = file;
		this.isoFile = createFile();

		return new Promise((resolve, reject) => {
			const iso = this.isoFile!;

			iso.onReady = (info: Movie) => {
				this.info = info;
				this.tracks = info.tracks.map((track: Track) => {
					const t: DemuxedTrack = {
						id: track.id,
						type: track.type === 'video' ? 'video' : 'audio',
						codec: codecStringFromTrack(track),
						codecDescription: extractCodecDescription(iso, track),
						timescale: track.timescale,
						duration: track.duration / track.timescale,
					};
					if (track.type === 'video') {
						t.width = track.video?.width;
						t.height = track.video?.height;
					} else if (track.type === 'audio') {
						t.sampleRate = track.audio?.sample_rate;
						t.channels = track.audio?.channel_count;
					}
					return t;
				});
				resolve(this.tracks);
			};

			iso.onError = (e: string) => {
				reject(new Error(`mp4box error: ${e}`));
			};

			this.feedFile(file).catch(reject);
		});
	}

	setExtractionTrack(trackId: number, onSample: (sample: DemuxedSample) => void): void {
		this.sampleCallbacks.set(trackId, onSample);
		const iso = this.isoFile;
		if (!iso) return;

		iso.onSamples = (id: number, _user: unknown, samples: Sample[]) => {
			const cb = this.sampleCallbacks.get(id);
			if (!cb) return;
			for (const sample of samples) {
				if (!sample.data) continue;
				cb({
					trackId: id,
					timestamp: (sample.cts / sample.timescale) * 1_000_000, // microseconds
					duration: (sample.duration / sample.timescale) * 1_000_000,
					data: new Uint8Array(sample.data),
					isKeyframe: sample.is_sync,
				});
			}
		};

		iso.setExtractionOptions(trackId, undefined, { nbSamples: 100 });
	}

	start(): void {
		this.isoFile?.start();
	}

	seek(timeS: number): { keyframeTimestamp: number } {
		const iso = this.isoFile;
		if (!iso || !this.info) return { keyframeTimestamp: 0 };

		const videoTrack = this.tracks.find((t) => t.type === 'video');
		if (!videoTrack) return { keyframeTimestamp: 0 };

		const seekResult = iso.seek(timeS, true);
		return { keyframeTimestamp: seekResult.offset / videoTrack.timescale };
	}

	flush(): void {
		this.isoFile?.flush();
	}

	destroy(): void {
		this.isoFile?.flush();
		this.isoFile = null;
		this.file = null;
		this.tracks = [];
		this.sampleCallbacks.clear();
		this.info = null;
	}

	private async feedFile(file: File): Promise<void> {
		let offset = 0;
		const reader = file.stream().getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const buf = value.buffer as MP4BoxBuffer;
			buf.fileStart = offset;
			offset += value.byteLength;
			this.isoFile!.appendBuffer(buf, offset >= file.size);
		}
	}
}
