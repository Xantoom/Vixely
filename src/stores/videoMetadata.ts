import { create } from 'zustand';
import type { DetailedProbeResultData, ProbeResultData } from '@/workers/ffmpeg-worker.ts';

const MAX_METADATA_CACHE_ENTRIES = 24;

export interface VideoMetadataCacheEntry {
	probe?: ProbeResultData;
	probeDetails?: DetailedProbeResultData;
	rustProbe?: ProbeResultData;
}

interface VideoMetadataState {
	cache: Map<string, VideoMetadataCacheEntry>;
	getMetadata: (key: string) => VideoMetadataCacheEntry | undefined;
	upsertMetadata: (key: string, patch: Partial<VideoMetadataCacheEntry>) => void;
	setRustMetadata: (key: string, rustProbe: ProbeResultData) => void;
	clearMetadata: (key?: string) => void;
}

export function cacheKeyForFile(file: File): string {
	return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

export const useVideoMetadataStore = create<VideoMetadataState>((set, get) => ({
	cache: new Map(),
	getMetadata: (key) => get().cache.get(key),
	upsertMetadata: (key, patch) => {
		set((state) => {
			const next = new Map(state.cache);
			const prev = next.get(key) ?? {};
			if (next.has(key)) next.delete(key);
			next.set(key, { ...prev, ...patch });
			while (next.size > MAX_METADATA_CACHE_ENTRIES) {
				const oldest = next.keys().next().value;
				if (typeof oldest !== 'string') break;
				next.delete(oldest);
			}
			return { cache: next };
		});
	},
	setRustMetadata: (key, rustProbe) => {
		get().upsertMetadata(key, { rustProbe, probe: rustProbe });
	},
	clearMetadata: (key) => {
		set((state) => {
			if (!key) return { cache: new Map() };
			const next = new Map(state.cache);
			next.delete(key);
			return { cache: next };
		});
	},
}));
