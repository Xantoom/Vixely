import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import stream from './fixtures/truehd.m2ts?url&inline';

/** What only patches/mediabunny makes work, which an update of Mediabunny can silently break. */
describe('patched Mediabunny', () => {
	it('reads the TrueHD of a Blu-ray transport stream', async () => {
		const file = await (await fetch(stream)).arrayBuffer();
		const input = new Input({ source: new BufferSource(file), formats: ALL_FORMATS });
		const audio = await input.getPrimaryAudioTrack();
		expect(await audio?.getCodec()).toBe('truehd');
		expect(await audio?.getNumberOfChannels()).toBe(6);
		expect(await input.computeDuration()).toBeGreaterThan(0.3);
	});
});
