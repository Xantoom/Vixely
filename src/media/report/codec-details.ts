/**
 * Profile, level and depth of a stream, read from its WebCodecs codec string (`hvc1.2.4.L153.B0`,
 * `avc1.640028`, `av01.0.08M.10`, `vp09.02.10.10`, `mp4a.40.2`).
 */

export interface VideoProfile {
	/** `Main 10`, `High`. */
	profile: string | null;
	/** `5.1`. */
	level: string | null;
	/** HEVC and AV1 tiers: `Main`, `High`. */
	tier: string | null;
	bitDepth: number | null;
	chroma: string | null;
}

const AVC_PROFILES: Record<number, string> = {
	66: 'Baseline',
	77: 'Main',
	88: 'Extended',
	100: 'High',
	110: 'High 10',
	122: 'High 4:2:2',
	244: 'High 4:4:4',
};

const HEVC_PROFILES: Record<number, string> = { 1: 'Main', 2: 'Main 10', 3: 'Main Still Picture', 4: 'Format Range' };

const AV1_PROFILES = ['Main', 'High', 'Professional'];

const NONE: VideoProfile = { profile: null, level: null, tier: null, bitDepth: null, chroma: null };

export function videoProfile(codecString: string | null): VideoProfile {
	if (!codecString) return NONE;
	const [kind = '', ...parts] = codecString.split('.');
	if (kind === 'avc1' || kind === 'avc3') {
		const hex = parts[0] ?? '';
		const profile = Number.parseInt(hex.slice(0, 2), 16);
		const level = Number.parseInt(hex.slice(4, 6), 16);
		return {
			...NONE,
			profile: AVC_PROFILES[profile] ?? null,
			level: Number.isFinite(level) ? (level === 9 ? '1b' : String(level / 10)) : null,
		};
	}
	if (kind === 'hvc1' || kind === 'hev1' || kind === 'dvh1' || kind === 'dvhe') {
		// hvc1.[profile space]profile.compatibility.(L|H)level.constraints
		const profile = Number.parseInt((parts[0] ?? '').replace(/^[A-C]/, ''), 10);
		const tierLevel = /^([LH])(\d+)$/.exec(parts[2] ?? '');
		return {
			...NONE,
			profile: HEVC_PROFILES[profile] ?? null,
			tier: tierLevel ? (tierLevel[1] === 'H' ? 'High' : 'Main') : null,
			level: tierLevel ? String(Number(tierLevel[2]) / 30) : null,
		};
	}
	if (kind === 'av01') {
		// av01.profile.(level)(tier).depth.mono.subsampling...
		const levelTier = /^(\d+)([MH])$/.exec(parts[1] ?? '');
		const index = levelTier ? Number(levelTier[1]) : null;
		const subsampling = parts[4] ?? '';
		return {
			profile: AV1_PROFILES[Number(parts[0])] ?? null,
			level: index === null ? null : `${2 + (index >> 2)}.${index & 3}`,
			tier: levelTier ? (levelTier[2] === 'H' ? 'High' : 'Main') : null,
			bitDepth: parts[2] ? Number(parts[2]) : null,
			chroma:
				parts[3] === '1'
					? '4:0:0'
					: subsampling.startsWith('11')
						? '4:2:0'
						: subsampling.startsWith('10')
							? '4:2:2'
							: subsampling.startsWith('00')
								? '4:4:4'
								: null,
		};
	}
	if (kind === 'vp09') {
		// vp09.profile.level.depth.chroma...
		const chroma = parts[3];
		return {
			...NONE,
			profile: parts[0] ? `Profile ${Number(parts[0])}` : null,
			level: parts[1] ? String(Number(parts[1]) / 10) : null,
			bitDepth: parts[2] ? Number(parts[2]) : null,
			chroma: chroma === undefined ? null : (['4:2:0', '4:2:0', '4:2:2', '4:4:4'][Number(chroma)] ?? null),
		};
	}
	return NONE;
}

/** The AAC object type of an `mp4a.40.x` string: LC, HE-AAC... */
export function aacProfile(codecString: string | null): string | null {
	const type = /^mp4a\.40\.(\d+)$/.exec(codecString ?? '')?.[1];
	if (!type) return null;
	return (
		{ '1': 'Main', '2': 'LC', '3': 'SSR', '4': 'LTP', '5': 'HE-AAC', '29': 'HE-AAC v2', '23': 'LD', '39': 'ELD' }[
			type
		] ?? null
	);
}

/** Bits per sample of uncompressed codecs, named after it. */
export function pcmDepth(codec: string | null): number | null {
	const bits = /^pcm-[suf](\d+)/.exec(codec ?? '')?.[1];
	if (bits) return Number(bits);
	return codec === 'ulaw' || codec === 'alaw' ? 8 : null;
}

/** Bits per sample of FLAC, from its STREAMINFO (with or without the `fLaC` marker and block header). */
export function flacDepth(description: Uint8Array | undefined): number | null {
	if (!description) return null;
	let at = 0;
	if (description[0] === 0x66 && description[1] === 0x4c) at = 4;
	if (description.length >= at + 4 + 34 && ((description[at] ?? 0) & 0x7f) === 0) at += 4;
	if (description.length < at + 14) return null;
	return ((((description[at + 12] ?? 0) & 1) << 4) | ((description[at + 13] ?? 0) >> 4)) + 1;
}

/** What a DTS frame carries beyond the core: `MA` (lossless), `HRA`, or null for plain DTS. */
export function dtsExtension(packet: Uint8Array): 'MA' | 'HRA' | null {
	let hd = false;
	for (let i = 0; i + 3 < packet.length; i++) {
		const a = packet[i];
		if (a === 0x41 && packet[i + 1] === 0xa2 && packet[i + 2] === 0x95 && packet[i + 3] === 0x47) return 'MA';
		if (a === 0x64 && packet[i + 1] === 0x58 && packet[i + 2] === 0x20 && packet[i + 3] === 0x25) hd = true;
	}
	return hd ? 'HRA' : null;
}

/**
 * Whether a TrueHD access unit announces Dolby Atmos: its major sync's 16-channel presentation,
 * signalled by the substream info and extended substream bits.
 */
export function trueHdAtmos(packet: Uint8Array): boolean {
	for (let i = 4; i + 18 < packet.length; i++) {
		if (packet[i] === 0xf8 && packet[i + 1] === 0x72 && packet[i + 2] === 0x6f && packet[i + 3] === 0xba) {
			// After the sync: format info (4 bytes), signature B752, flags (4 bytes), peak rate (2),
			// substream count, then substream_info, whose top bit marks the 16-channel presentation.
			if (packet[i + 8] !== 0xb7 || packet[i + 9] !== 0x52) return false;
			return ((packet[i + 17] ?? 0) & 0x80) !== 0;
		}
	}
	return false;
}

/** E-AC-3 with Joint Object Coding, Atmos, as its MP4 `dec3` box says it. */
export function eac3Atmos(dec3: Uint8Array | undefined): boolean {
	if (!dec3 || dec3.length < 5) return false;
	const substreams = ((dec3[1] ?? 0) & 7) + 1;
	let at = 2;
	for (let i = 0; i < substreams; i++) {
		// fscod, bsid, asvc, bsmod, acmod, lfeon, then the count of dependent substreams.
		const dependents = ((dec3[at + 2] ?? 0) >> 1) & 0x0f;
		at += dependents > 0 ? 4 : 3;
	}
	return at < dec3.length && ((dec3[at] ?? 0) & 1) === 1;
}
