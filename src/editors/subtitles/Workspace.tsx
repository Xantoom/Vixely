import { useCallback, useEffect, useState } from 'react';
import { isTyping } from '@/editor/shortcuts';
import { usePlayback } from '@/media/playback';
import { AROUND, AudioBox, SubtitlePlayer } from './AudioBox';
import { gridLines, MIN_CUE, removeCues, setCueTimes } from './document';
import { EditBox } from './EditBox';
import { LineGrid } from './LineGrid';
import { QualityBar } from './QualityBar';
import { useSubtitleDoc, useSubtitleEditor } from './store';
import { SubtitleViewer, subtitleFrame } from './SubtitleViewer';

/**
 * Keys of Aegisub where they make sense here: Space plays, R plays the line, Q and W the half
 * second before and after it; I and O set its start and end at the playhead; Delete removes the
 * selected lines.
 */
export function useSubtitleShortcuts(inDialog = false) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target, inDialog)) return;
			const state = useSubtitleEditor.getState();
			const playback = usePlayback.getState();
			const time = playback.time * 1000;
			const active =
				state.active === null ? undefined : state.history.present.cues.find((cue) => cue.id === state.active);
			const key = event.key.toLowerCase();
			if (event.key === ' ') {
				event.preventDefault();
				playback.toggle();
			} else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selection.size > 0) {
				event.preventDefault();
				const ids = state.selection;
				const lines = gridLines(state.history.present);
				const after = lines
					.slice(lines.findIndex((cue) => cue.id === state.active))
					.find((cue) => !ids.has(cue.id));
				state.apply((doc) => removeCues(doc, ids));
				state.select(after ? [after.id] : []);
			} else if (!active) {
				return;
			} else if (key === 'r') {
				playback.playRange(active.start / 1000, active.end / 1000);
			} else if (key === 'q') {
				playback.playRange(Math.max(0, active.start / 1000 - AROUND), active.start / 1000);
			} else if (key === 'w') {
				playback.playRange(active.end / 1000, active.end / 1000 + AROUND);
			} else if (key === 'i') {
				state.apply((doc) => setCueTimes(doc, active.id, time, Math.max(active.end, time + MIN_CUE)));
			} else if (key === 'o') {
				state.apply((doc) => setCueTimes(doc, active.id, active.start, Math.max(time, active.start + MIN_CUE)));
			}
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.key === ' ' && event.target instanceof HTMLButtonElement) event.preventDefault();
		};
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [inDialog]);
}

/**
 * Pictures narrower than this, width over height, stand in a column of their own: square, 4:5,
 * 3:4, 9:16, 9:21. Wider ones (4:3, 16:9, 21:9) are laid out with the lines beside them.
 */
const COLUMN_BELOW = 1.2;

/** Whether the picture stands in a column of its own, by the shape it is drawn at. */
function useColumnPicture(): boolean {
	const doc = useSubtitleDoc();
	const video = usePlayback((state) => state.details?.video ?? null);
	const frame = subtitleFrame(doc, video);
	return frame.width / frame.height < COLUMN_BELOW;
}

/**
 * The editor's parts, laid out for the shape of the picture. A wide one (films, series) is large
 * at the top left with the line being edited under it, every line beside them, and the sound
 * across the whole width at the bottom. A square or tall one (posts, Reels, TikTok, Shorts) takes
 * the whole height on the left with the playback bar under it, as on a phone; beside it, from
 * the top, the sound, the line being edited and every line. On phones, one under the other.
 */
export function Workspace({ title }: { title: string }) {
	const column = useColumnPicture();
	const [fit, setFit] = useState(0);
	// Changes of a few pixels are the layout settling: ignoring them keeps it from going back and forth.
	const onFit = useCallback((width: number) => {
		setFit((current) => (Math.abs(current - width) < 4 ? current : width));
	}, []);
	const list = (
		<div className="flex min-w-0 flex-col gap-1 max-lg:order-4 max-lg:h-[60svh] max-lg:px-3 lg:min-h-0">
			<QualityBar />
			<div className="min-h-0 flex-1">
				<LineGrid />
			</div>
		</div>
	);
	if (column) {
		return (
			<div
				className="h-full min-h-0 gap-3 max-lg:flex max-lg:flex-col max-lg:overflow-auto max-lg:pb-3 lg:grid lg:grid-rows-[clamp(11rem,30%,15rem)_auto_minmax(0,1fr)] lg:p-3"
				// The picture's column is as wide as the picture is at the full height: no bands beside it.
				style={{
					gridTemplateColumns: fit
						? `minmax(18rem, min(${fit}px, 46%)) minmax(24rem, 1fr)`
						: 'minmax(18rem, 34%) minmax(24rem, 1fr)',
				}}
			>
				<div className="min-w-0 max-lg:order-1 lg:row-span-3 lg:min-h-0">
					<SubtitleViewer title={title} onFit={onFit} controls={<SubtitlePlayer />} />
				</div>
				<div className="min-w-0 max-lg:order-2 max-lg:h-44 max-lg:flex-none max-lg:px-3 lg:min-h-0">
					<AudioBox transport={false} />
				</div>
				<div className="min-w-0 max-lg:order-3">
					<EditBox />
				</div>
				{list}
			</div>
		);
	}
	return (
		<div
			className="h-full min-h-0 gap-3 max-lg:flex max-lg:flex-col max-lg:overflow-auto max-lg:pb-3 lg:grid lg:grid-rows-[minmax(0,1fr)_auto_clamp(10rem,24%,13rem)] lg:p-3"
			// The picture column is as wide as the picture is at the height it has: no bands beside it.
			style={{
				gridTemplateColumns: fit
					? `minmax(20rem, min(${fit}px, 62%)) minmax(22rem, 1fr)`
					: 'minmax(0, 1.3fr) minmax(22rem, 1fr)',
			}}
		>
			<div className="min-w-0 max-lg:order-1 lg:col-start-1 lg:row-start-1 lg:min-h-0">
				<SubtitleViewer title={title} onFit={onFit} />
			</div>
			<div className="min-w-0 max-lg:order-3 lg:col-start-1 lg:row-start-2">
				<EditBox />
			</div>
			<div className="contents lg:[&>div]:col-start-2 lg:[&>div]:row-span-2 lg:[&>div]:row-start-1">{list}</div>
			<div className="min-w-0 max-lg:order-2 max-lg:h-52 max-lg:flex-none max-lg:px-3 lg:col-span-2 lg:row-start-3 lg:min-h-0">
				<AudioBox />
			</div>
		</div>
	);
}
