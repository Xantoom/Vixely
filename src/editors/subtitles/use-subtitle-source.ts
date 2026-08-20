import { useCallback, useEffect, useMemo, useState } from "react";
import { createContainerBackend, type SubtitleTrackInfo } from "~/core/container";
import {
	createSubtitleDocument,
	type SubtitleDocument,
	type SubtitleFormat,
} from "~/core/document";
import {
	buildDisplaySets,
	decodeSubtitleText,
	detectFormat,
	parseSubtitles,
	parseSupSegments,
	toCues,
	type SubtitleTrack,
} from "~/core/subtitles";

export type LoadedSubtitles = {
	readonly document: SubtitleDocument | null;
	/** Tracks found inside a container, when the file was a Matroska. */
	readonly containerTracks: readonly SubtitleTrackInfo[];
	readonly loading: boolean;
	readonly error: string | null;
};

/**
 * Opens either a subtitle file or a container carrying subtitle tracks.
 *
 * A Matroska goes through `core/container`, which is the only reason subtitle
 * tracks are reachable at all — Mediabunny reports none.
 */
export function useSubtitleSource(file: File | null): LoadedSubtitles & {
	readonly selectTrack: (id: number) => void;
} {
	const [state, setState] = useState<LoadedSubtitles>({
		document: null,
		containerTracks: [],
		loading: false,
		error: null,
	});
	const [bytes, setBytes] = useState<Uint8Array | null>(null);
	const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);

	const backend = useMemo(() => createContainerBackend(), []);

	useEffect(() => {
		if (file === null) return;
		let cancelled = false;

		const load = async () => {
			setState({ document: null, containerTracks: [], loading: true, error: null });
			try {
				const raw = new Uint8Array(await file.arrayBuffer());
				if (cancelled) return;
				setBytes(raw);

				if (backend.canRead(raw)) {
					const tracks = await backend.readSubtitleTracks(raw);
					if (cancelled) return;
					if (tracks.length === 0) {
						throw new Error("this container carries no subtitle track");
					}
					setSelectedTrackId(tracks[0]?.id ?? null);
					setState({
						document: null,
						containerTracks: tracks,
						loading: false,
						error: null,
					});
					return;
				}

				const { text } = decodeSubtitleText(raw);
				const format = detectFormat(text, file.name);
				if (format === null) throw new Error("unrecognised subtitle format");
				if (format === "pgs") {
					const track = pgsToDocument(raw, file);
					if (cancelled) return;
					setState({ document: track, containerTracks: [], loading: false, error: null });
					return;
				}

				const parsed = parseSubtitles(text, format);
				if (cancelled) return;
				setState({
					document: toDocument(parsed, file, format),
					containerTracks: [],
					loading: false,
					error: null,
				});
			} catch (cause) {
				if (cancelled) return;
				setState({
					document: null,
					containerTracks: [],
					loading: false,
					error: cause instanceof Error ? cause.message : String(cause),
				});
			}
		};

		void load();
		return () => {
			cancelled = true;
		};
	}, [file, backend]);

	// Reading a track out of a container is a second step, driven by the picker.
	useEffect(() => {
		if (bytes === null || selectedTrackId === null || state.containerTracks.length === 0) return;
		let cancelled = false;

		const read = async () => {
			try {
				const payload = await backend.readSubtitlePayload(bytes, selectedTrackId);
				if (cancelled || file === null) return;
				setState((current) => ({
					...current,
					document: payloadToDocument(payload, file),
				}));
			} catch (cause) {
				if (cancelled) return;
				setState((current) => ({
					...current,
					error: cause instanceof Error ? cause.message : String(cause),
				}));
			}
		};

		void read();
		return () => {
			cancelled = true;
		};
	}, [bytes, selectedTrackId, state.containerTracks.length, backend, file]);

	const selectTrack = useCallback((id: number) => setSelectedTrackId(id), []);

	return { ...state, selectTrack };
}

function toDocument(track: SubtitleTrack, file: File, format: SubtitleFormat): SubtitleDocument {
	return {
		...createSubtitleDocument({
			id: crypto.randomUUID(),
			name: file.name,
			byteLength: file.size,
			mimeType: file.type,
		}),
		format,
		cues: track.cues,
		styles: track.styles,
		scriptInfo: track.scriptInfo,
		export: { format },
	};
}

/** PGS becomes cues with timings and no editable text, which is the point. */
function pgsToDocument(bytes: Uint8Array, file: File): SubtitleDocument {
	const cues = toCues(buildDisplaySets(parseSupSegments(bytes)));
	return {
		...createSubtitleDocument({
			id: crypto.randomUUID(),
			name: file.name,
			byteLength: file.size,
			mimeType: file.type,
		}),
		format: "pgs",
		cues: cues.map((cue) => ({
			id: cue.id,
			startMs: cue.startMs,
			endMs: cue.endMs,
			text: "",
			styleName: null,
			layer: 0,
			marginLeft: null,
			marginRight: null,
			marginVertical: null,
			effect: null,
		})),
		export: { format: "pgs" },
	};
}

function payloadToDocument(
	payload: Awaited<ReturnType<ReturnType<typeof createContainerBackend>["readSubtitlePayload"]>>,
	file: File,
): SubtitleDocument {
	const format = payload.track.format ?? "srt";
	const decoder = new TextDecoder();

	// The ASS header travels in CodecPrivate, and it carries the styles.
	const header =
		payload.header === null || format !== "ass"
			? null
			: parseSubtitles(decoder.decode(payload.header), "ass");

	return {
		...createSubtitleDocument({
			id: crypto.randomUUID(),
			name: file.name,
			byteLength: file.size,
			mimeType: file.type,
		}),
		format,
		cues: payload.entries.map((entry, index) => ({
			id: `${payload.track.id}-${index}`,
			startMs: entry.timestampMs,
			endMs: entry.timestampMs + (entry.durationMs ?? 2000),
			text: format === "pgs" ? "" : decoder.decode(entry.payload),
			styleName: null,
			layer: 0,
			marginLeft: null,
			marginRight: null,
			marginVertical: null,
			effect: null,
		})),
		styles: header?.styles ?? [],
		scriptInfo: header?.scriptInfo ?? {},
		export: { format },
	};
}
