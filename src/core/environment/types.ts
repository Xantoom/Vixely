export type BrowserEngine = "chromium" | "gecko" | "webkit" | "unknown";

export type EnvironmentProbes = {
	readonly userAgent: string;
	readonly hasVideoEncoder: boolean;
	readonly hasVideoDecoder: boolean;
	readonly hasAudioEncoder: boolean;
	readonly hasAudioDecoder: boolean;
	readonly hasFileSystemWritableStream: boolean;
	readonly hasWebGL2: boolean;
	readonly hasOffscreenCanvas: boolean;
	readonly hasWebAudio: boolean;
	readonly hasSharedWorker: boolean;
	readonly hardwareConcurrency: number;
	readonly deviceMemoryGb: number | null;
	readonly isMobile: boolean;
};

export type CapabilityLevel = "full" | "limited" | "unsupported";

/** i18n keys of the sentences shown to the user. None takes a variable. */
export type EnvironmentLimitationKey =
	| "environment.noWebCodecsVideo"
	| "environment.noWebCodecsAudio"
	| "environment.audioPassthroughOnly"
	| "environment.noStreamingExport"
	| "environment.noWebGL2"
	| "environment.noOffscreenCanvas";

export type EnvironmentLimitation = {
	readonly key: EnvironmentLimitationKey;
	readonly severity: "info" | "warning" | "blocking";
};

export type EnvironmentReport = {
	readonly engine: BrowserEngine;
	readonly level: CapabilityLevel;
	/** Streaming writes to disk; false means the file is assembled in memory. */
	readonly streamingExport: boolean;
	/** Practical output ceiling in bytes; null means no practical ceiling. */
	readonly exportSizeCeilingBytes: number | null;
	readonly canEditVideo: boolean;
	readonly canEditAudio: boolean;
	readonly canReencodeAudio: boolean;
	/** Cutting or filtering video while keeping the original soundtrack intact. */
	readonly canPassthroughAudio: boolean;
	readonly canEditImages: boolean;
	readonly canEditGif: boolean;
	readonly canEditSubtitles: boolean;
	readonly limitations: readonly EnvironmentLimitation[];
	readonly probes: EnvironmentProbes;
};
