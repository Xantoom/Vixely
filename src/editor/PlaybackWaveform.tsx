import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Range } from '@/document/timemap';
import { type Peaks, type PeaksReader, readPeaks } from '@/media/peaks';
import { usePlayback } from '@/media/playback';
import { useCssColors } from '@/ui/css-colors';
import { useBoxSize } from '@/ui/use-box-size';

const WAVE_COLORS = ['--audio-1'] as const;

/**
 * The waveform read once per file and audio track, and kept when the editor is left and
 * reopened: long files take a few seconds.
 */
let cached: { file: File; track: number | null; reader: PeaksReader } | null = null;
/** Waveforms on screen, told when more of the file is read. */
const listeners = new Set<() => void>();

export function usePlaybackPeaks(): { peaks: Peaks | null; version: number } {
	const file = usePlayback((state) => state.file);
	const duration = usePlayback((state) => state.details?.duration ?? null);
	const track = usePlayback((state) => state.audioTrack);
	const [version, setVersion] = useState(0);
	const [peaks, setPeaks] = useState<Peaks | null>(null);

	useEffect(() => {
		if (!file || duration === null || track === null) {
			setPeaks(null);
			return;
		}
		if (cached?.file !== file || cached.track !== track) {
			cached?.reader.cancel();
			const reader = readPeaks(
				file,
				duration,
				() => {
					for (const listener of listeners) listener();
				},
				track,
			);
			reader.done.catch(() => undefined);
			cached = { file, track, reader };
		}
		setPeaks(cached.reader.peaks);
		const listener = () => {
			setVersion((value) => value + 1);
		};
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}, [file, duration, track]);

	return { peaks, version };
}

export function Waveform({ peaks, version, view }: { peaks: Peaks | null; version: number; view: Range }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = useBoxSize(canvasRef);
	const [color = ''] = useCssColors(WAVE_COLORS);
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || size.width === 0) return;
		const ratio = window.devicePixelRatio || 1;
		const width = Math.round(size.width * ratio);
		const height = Math.round(size.height * ratio);
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		context.clearRect(0, 0, width, height);
		if (!peaks) return;
		const middle = height / 2;
		const span = view.end - view.start;
		const out = { min: 0, max: 0 };
		context.fillStyle = color;
		for (let x = 0; x < width; x++) {
			const from = view.start + (x / width) * span;
			if (!peaks.range(from, from + span / width, out)) continue;
			const y = middle - out.max * middle * 0.94;
			context.fillRect(x, y, 1, Math.max(ratio, middle - out.min * middle * 0.94 - y));
		}
	}, [peaks, version, view, size, color]);
	return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" />;
}
