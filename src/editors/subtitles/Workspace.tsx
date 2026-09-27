import { useEffect } from 'react';
import { isTyping } from '@/editor/shortcuts';
import { usePlayback } from '@/media/playback';
import { AROUND, AudioBox } from './AudioBox';
import { gridLines, MIN_CUE, removeCues, setCueTimes } from './document';
import { EditBox } from './EditBox';
import { LineGrid } from './LineGrid';
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
 * Aegisub's layout: the video top left, the sound of the line top right with the line's edit box
 * under it, and every line in a grid below.
 */
export function Workspace({ title }: { title: string }) {
	return (
		<div className="grid h-full min-h-0 gap-3 p-3 max-lg:grid-rows-[max(240px,56vw)_180px_220px_60vh] max-lg:overflow-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)]">
			<div className="min-h-0 min-w-0">
				<SubtitleViewer title={title} />
			</div>
			<div className="grid min-h-0 min-w-0 gap-3 max-lg:contents lg:grid-rows-[minmax(0,1fr)_minmax(150px,auto)]">
				<div className="min-h-0 min-w-0">
					<AudioBox />
				</div>
				<div className="min-h-0 min-w-0">
					<EditBox />
				</div>
			</div>
			<div className="min-h-0 min-w-0 lg:col-span-2">
				<LineGrid />
			</div>
		</div>
	);
}
