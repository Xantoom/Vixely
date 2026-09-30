import { create } from 'zustand';

/**
 * How loud the editors play, for the person listening: not an edit, never exported. Shared by
 * every player and kept between visits.
 */
interface Listening {
	/** 0 to 1. */
	volume: number;
	muted: boolean;
	setVolume: (volume: number) => void;
	toggleMute: () => void;
}

const STORAGE_KEY = 'vixely:volume';

function stored(): { volume: number; muted: boolean } {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
		if (typeof saved !== 'object' || saved === null) return { volume: 1, muted: false };
		const volume =
			'volume' in saved && typeof saved.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : 1;
		return { volume, muted: 'muted' in saved && saved.muted === true };
	} catch {
		return { volume: 1, muted: false };
	}
}

function save(state: { volume: number; muted: boolean }) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: state.volume, muted: state.muted }));
	} catch {
		// Private windows may refuse: the volume then lasts the visit.
	}
}

export const useListening = create<Listening>()((set, get) => ({
	...stored(),
	setVolume(volume) {
		const next = { volume: Math.min(1, Math.max(0, volume)), muted: volume <= 0 ? get().muted : false };
		set(next);
		save(next);
	},
	toggleMute() {
		const next = { volume: get().volume || 1, muted: !get().muted };
		set(next);
		save(next);
	},
}));

/** The gain the speakers get: the volume on a curve that sounds even, silent when muted. */
export function listeningGain(state: { volume: number; muted: boolean }): number {
	return state.muted ? 0 : state.volume * state.volume;
}
