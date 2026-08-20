import { dbToGain, limitGainToPeak, measureLoudness } from "./loudness.ts";
import { segmentDuration, totalDuration } from "./segments.ts";
import type { AudioDocument, EqualizerBand } from "../document/types.ts";

/**
 * Renders an audio document to samples.
 *
 * This is the audio half of I1: preview and export both come through here, so
 * what is heard while scrubbing is what lands in the file. The graph is
 * described once — segments, gain, fades, equaliser, loudness — and
 * `OfflineAudioContext` runs it faster than real time for the export while
 * the same description drives the live nodes for playback.
 */

export type RenderedAudio = {
	readonly buffer: AudioBuffer;
	/** Set when normalisation had to be capped to avoid clipping. */
	readonly limitedGainDb: number | null;
};

/** Nodes the preview builds from the same description, in the same order. */
export type AudioChainDescription = {
	readonly segments: readonly {
		readonly sourceStartSec: number;
		readonly sourceEndSec: number;
		readonly outputStartSec: number;
		readonly gainDb: number;
		readonly fadeInSec: number;
		readonly fadeOutSec: number;
	}[];
	readonly equalizer: readonly EqualizerBand[];
	readonly masterGainDb: number;
	readonly durationSec: number;
};

/**
 * The single description both paths read.
 *
 * Building it here rather than in the editor is what stops the preview chain
 * and the export chain from drifting apart.
 */
export function describeAudioChain(
	document_: AudioDocument,
	measuredGainDb = 0,
): AudioChainDescription {
	let outputStartSec = 0;
	const segments = document_.segments.map((segment) => {
		const described = {
			sourceStartSec: segment.startSec,
			sourceEndSec: segment.endSec,
			outputStartSec,
			gainDb: segment.gainDb,
			fadeInSec: segment.fadeInSec,
			fadeOutSec: segment.fadeOutSec,
		};
		outputStartSec += segmentDuration(segment);
		return described;
	});

	return {
		segments,
		equalizer: document_.equalizer.filter((band) => band.enabled && band.gainDb !== 0),
		masterGainDb: document_.loudness.enabled ? measuredGainDb : 0,
		durationSec: totalDuration(document_.segments),
	};
}

/**
 * Runs the chain offline and returns the processed samples.
 *
 * Loudness is measured on the cut result rather than on the source: the user
 * normalises what they are exporting, not what they started from.
 */
export async function renderAudioDocument(
	document_: AudioDocument,
	source: AudioBuffer,
): Promise<RenderedAudio> {
	const cut = await runChain(source, describeAudioChain(document_, 0));

	if (!document_.loudness.enabled) return { buffer: cut, limitedGainDb: null };

	const channels = Array.from({ length: cut.numberOfChannels }, (_, index) =>
		cut.getChannelData(index),
	);
	const measurement = measureLoudness(channels, cut.sampleRate, document_.loudness.targetLufs);
	const limited = limitGainToPeak(
		measurement.gainToTargetDb,
		measurement.samplePeakDb,
		document_.loudness.truePeakDb,
	);

	if (limited.gainDb === 0) return { buffer: cut, limitedGainDb: null };

	// A second pass rather than a guess: the gain is known exactly by now.
	const normalised = await applyGain(cut, dbToGain(limited.gainDb));
	return { buffer: normalised, limitedGainDb: limited.limited ? limited.gainDb : null };
}

async function runChain(source: AudioBuffer, chain: AudioChainDescription): Promise<AudioBuffer> {
	const frames = Math.max(1, Math.round(chain.durationSec * source.sampleRate));
	const context = new OfflineAudioContext(source.numberOfChannels, frames, source.sampleRate);

	const tail = buildEqualizer(context, chain.equalizer);
	tail.output.connect(context.destination);

	for (const segment of chain.segments) {
		const node = context.createBufferSource();
		node.buffer = source;

		const gain = context.createGain();
		const duration = segment.sourceEndSec - segment.sourceStartSec;
		const base = dbToGain(segment.gainDb);
		const start = segment.outputStartSec;

		gain.gain.setValueAtTime(segment.fadeInSec > 0 ? 0 : base, start);
		if (segment.fadeInSec > 0) {
			gain.gain.linearRampToValueAtTime(base, start + segment.fadeInSec);
		}
		if (segment.fadeOutSec > 0) {
			gain.gain.setValueAtTime(base, start + Math.max(0, duration - segment.fadeOutSec));
			gain.gain.linearRampToValueAtTime(0, start + duration);
		}

		node.connect(gain);
		gain.connect(tail.input);
		node.start(start, segment.sourceStartSec, duration);
	}

	return context.startRendering();
}

/** Chains the enabled bands; an empty equaliser is a straight pass-through. */
export function buildEqualizer(
	context: BaseAudioContext,
	bands: readonly EqualizerBand[],
): { readonly input: AudioNode; readonly output: AudioNode } {
	const entry = context.createGain();
	let tail: AudioNode = entry;

	for (const band of bands) {
		const filter = context.createBiquadFilter();
		filter.type = band.type;
		filter.frequency.value = band.frequency;
		filter.Q.value = band.q;
		filter.gain.value = band.gainDb;
		tail.connect(filter);
		tail = filter;
	}

	return { input: entry, output: tail };
}

async function applyGain(buffer: AudioBuffer, gain: number): Promise<AudioBuffer> {
	const context = new OfflineAudioContext(
		buffer.numberOfChannels,
		buffer.length,
		buffer.sampleRate,
	);
	const source = context.createBufferSource();
	source.buffer = buffer;
	const node = context.createGain();
	node.gain.value = gain;
	source.connect(node);
	node.connect(context.destination);
	source.start();
	return context.startRendering();
}

/** True when the document asks for nothing that touches the samples. */
export function chainIsPassthrough(document_: AudioDocument, sourceDurationSec: number): boolean {
	const untouched =
		document_.segments.length === 1 &&
		document_.segments[0]?.startSec === 0 &&
		Math.abs((document_.segments[0]?.endSec ?? 0) - sourceDurationSec) < 0.001 &&
		document_.segments[0]?.gainDb === 0 &&
		document_.segments[0]?.fadeInSec === 0 &&
		document_.segments[0]?.fadeOutSec === 0;

	return (
		untouched &&
		!document_.loudness.enabled &&
		document_.equalizer.every((band) => !band.enabled || band.gainDb === 0)
	);
}
