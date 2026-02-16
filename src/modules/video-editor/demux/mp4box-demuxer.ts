import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, type EncodedPacket, type InputTrack } from 'mediabunny';
import type { Demuxer, DemuxedTrack, DemuxedSample } from './demuxer.ts';

function toUint8Array(value: AllowSharedBufferSource | undefined): Uint8Array {
	if (!value) return new Uint8Array(0);
	if (value instanceof Uint8Array) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	}
	return new Uint8Array(value);
}

function packetToDemuxedSample(trackId: number, packet: EncodedPacket): DemuxedSample {
	return {
		trackId,
		timestamp: Math.max(0, Math.round(packet.timestamp * 1_000_000)),
		duration: Math.max(0, Math.round(packet.duration * 1_000_000)),
		data: new Uint8Array(packet.data),
		isKeyframe: packet.type === 'key',
	};
}

export class Mp4boxDemuxer implements Demuxer {
	private input: Input | null = null;
	private tracks: DemuxedTrack[] = [];
	private inputTrackById = new Map<number, InputTrack>();
	private sampleCallbacks = new Map<number, (sample: DemuxedSample) => void>();
	private seekTimeS: number | null = null;
	private generation = 0;
	private activeTasks: Promise<void>[] = [];

	async open(file: File): Promise<DemuxedTrack[]> {
		this.destroy();
		this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

		const tracks = await this.input.getTracks();
		const mediaTracks = tracks.filter((track) => track.type === 'video' || track.type === 'audio');

		const mapped = await Promise.all(
			mediaTracks.map(async (track): Promise<DemuxedTrack> => {
				let codec = track.codec ?? 'unknown';
				let codecDescription = new Uint8Array(0);
				let width: number | undefined;
				let height: number | undefined;
				let sampleRate: number | undefined;
				let channels: number | undefined;

				if (track.isVideoTrack()) {
					const decoderConfig = await track.getDecoderConfig();
					codec = decoderConfig?.codec ?? codec;
					codecDescription = new Uint8Array(toUint8Array(decoderConfig?.description));
					width = track.codedWidth;
					height = track.codedHeight;
				} else if (track.isAudioTrack()) {
					const decoderConfig = await track.getDecoderConfig();
					codec = decoderConfig?.codec ?? codec;
					codecDescription = new Uint8Array(toUint8Array(decoderConfig?.description));
					sampleRate = track.sampleRate;
					channels = track.numberOfChannels;
				}

				return {
					id: track.id,
					type: track.type === 'video' ? 'video' : 'audio',
					codec,
					codecDescription,
					width,
					height,
					sampleRate,
					channels,
					timescale: Math.max(1, Math.round(track.timeResolution)),
					duration: await track.computeDuration(),
				};
			}),
		);

		this.tracks = mapped;
		this.inputTrackById = new Map(mediaTracks.map((track) => [track.id, track]));
		return mapped;
	}

	setExtractionTrack(trackId: number, onSample: (sample: DemuxedSample) => void): void {
		this.sampleCallbacks.set(trackId, onSample);
	}

	start(): void {
		if (!this.input) return;
		this.generation += 1;
		const generation = this.generation;
		this.activeTasks = [];

		for (const [trackId, callback] of this.sampleCallbacks.entries()) {
			const track = this.inputTrackById.get(trackId);
			if (!track) continue;
			const task = this.streamTrackPackets(generation, trackId, track, callback);
			this.activeTasks.push(task);
		}
	}

	seek(timeS: number): { keyframeTimestamp: number } {
		this.seekTimeS = Math.max(0, timeS);
		return { keyframeTimestamp: this.seekTimeS };
	}

	flush(): void {
		// No explicit flush required for Mediabunny packet sinks.
	}

	destroy(): void {
		this.generation += 1;
		this.activeTasks = [];
		this.sampleCallbacks.clear();
		this.inputTrackById.clear();
		this.tracks = [];
		this.seekTimeS = null;
		if (this.input) {
			this.input.dispose();
			this.input = null;
		}
	}

	private async streamTrackPackets(
		generation: number,
		trackId: number,
		track: InputTrack,
		onSample: (sample: DemuxedSample) => void,
	): Promise<void> {
		const sink = new EncodedPacketSink(track);
		const seekTime = this.seekTimeS;
		let packet: EncodedPacket | null;
		if (seekTime == null) {
			packet = await sink.getFirstPacket();
		} else if (track.type === 'video') {
			packet = await sink.getKeyPacket(seekTime);
		} else {
			packet = await sink.getPacket(seekTime);
		}
		if (!packet) return;

		for await (const nextPacket of sink.packets(packet)) {
			if (generation !== this.generation) break;
			onSample(packetToDemuxedSample(trackId, nextPacket));
		}
	}
}
