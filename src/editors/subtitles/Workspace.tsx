import { useEffect } from 'react';
import { isTyping } from '@/editor/shortcuts';
import { usePlayback } from '@/media/playback';
import { AROUND, AudioBox } from './AudioBox';
import { gridLines, MIN_CUE, removeCues, setCueTimes } from './document';
import { EditBox } from './EditBox';
import { LineGrid } from './LineGrid';
import { QualityBar, useVertical } from './QualityBar';
import { useSubtitleEditor } from './store';
import { SubtitleViewer } from './SubtitleViewer';

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
 * The editor's parts, laid out for the shape of the video. A wide video (films, series, anime)
 * gets the picture large with the line being edited under it and every line beside them. A
 * vertical one (TikTok, Reels, Shorts) stands in a narrow column, the line and the list beside
 * it. The sound runs across the whole width at the bottom, under the one playback bar. On
 * phones, one under the other: picture, sound, line, list.
 */
export function Workspace({ title }: { title: string }) {
	const vertical = useVertical();
	const list = (
		<div className="flex min-w-0 flex-col gap-1 max-lg:order-4 max-lg:h-[60svh] max-lg:px-3 lg:min-h-0">
			<QualityBar />
			<div className="min-h-0 flex-1">
				<LineGrid />
			</div>
		</div>
	);
	const timeline = (
		<div className="min-w-0 max-lg:order-2 max-lg:h-52 max-lg:flex-none max-lg:px-3 lg:min-h-0">
			<AudioBox />
		</div>
	);
	if (vertical) {
		return (
			<div className="h-full min-h-0 gap-3 max-lg:flex max-lg:flex-col max-lg:overflow-auto max-lg:pb-3 lg:grid lg:grid-cols-[minmax(14rem,0.6fr)_minmax(0,1fr)_minmax(20rem,1fr)] lg:grid-rows-[minmax(0,1fr)_minmax(12rem,26%)] lg:p-3">
				<div className="min-w-0 max-lg:order-1 lg:min-h-0">
					<SubtitleViewer title={title} />
				</div>
				<div className="min-w-0 max-lg:order-3 lg:max-h-full lg:min-h-0 lg:self-start">
					<EditBox />
				</div>
				{list}
				<div className="contents lg:[&>div]:col-span-3">{timeline}</div>
			</div>
		);
	}
	return (
		<div className="h-full min-h-0 gap-3 max-lg:flex max-lg:flex-col max-lg:overflow-auto max-lg:pb-3 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(22rem,1fr)] lg:grid-rows-[minmax(0,1fr)_auto_minmax(12rem,27%)] lg:p-3">
			<div className="min-w-0 max-lg:order-1 lg:col-start-1 lg:row-start-1 lg:min-h-0">
				<SubtitleViewer title={title} />
			</div>
			<div className="min-w-0 max-lg:order-3 lg:col-start-1 lg:row-start-2">
				<EditBox />
			</div>
			<div className="contents lg:[&>div]:col-start-2 lg:[&>div]:row-span-2 lg:[&>div]:row-start-1">{list}</div>
			<div className="contents lg:[&>div]:col-span-2 lg:[&>div]:row-start-3">{timeline}</div>
		</div>
	);
}
