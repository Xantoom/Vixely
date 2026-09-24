import { Captions } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PlayerControls, PlayerMenu, PlayerPicture } from '@/editor/PlayerControls';
import { isTyping } from '@/editor/shortcuts';
import { languageName } from '@/lib/language';
import { usePlayback } from '@/media/playback';
import type { OpenedFile } from '@/media/session';
import { m } from '@/paraglide/messages.js';
import { useBoxSize } from '@/ui/use-box-size';
import { type TrackKey, useProjectTracks, useSubtitleProject } from '../subtitles/project';
import { useSubtitleDoc } from '../subtitles/store';
import { SubtitleLayer } from '../subtitles/SubtitleViewer';

const OFF = 'off';

/** Which subtitle track shows over the video: the one edited in the subtitle editor, marked so. */
function SubtitleMenu({ shown, onShown }: { shown: boolean; onShown: (shown: boolean) => void }) {
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const choose = useSubtitleProject((state) => state.choose);
	const options = tracks.filter((track) => track.original && (track.key !== 'new' || track.edited));
	if (options.length === 0) return null;
	return (
		<PlayerMenu
			icon={Captions}
			label={m.player_subtitles()}
			value={shown && current !== null ? String(current) : OFF}
			options={[
				{ value: OFF, label: m.player_subtitles_off() },
				...options.map((track) => ({
					value: String(track.key),
					label: `${track.info ? [languageName(track.info.language), track.info.name].filter(Boolean).join(', ') : m.subs_new_track()}${track.edited ? ` (${m.subs_track_edited()})` : ''}`,
				})),
			]}
			onChange={(value) => {
				if (value === OFF) {
					onShown(false);
					return;
				}
				const key: TrackKey = value === 'new' ? 'new' : Number(value);
				choose(key);
				onShown(true);
			}}
		/>
	);
}

/**
 * The video playing, with its sound track of choice and its subtitles, including the edits made
 * in the subtitle editor. Shares its player with the subtitle editor: going from one to the other
 * keeps the moment and the tracks.
 */
export function VideoPreview({ opened }: { opened: OpenedFile }) {
	const time = usePlayback((state) => state.time);
	const video = usePlayback((state) => state.details?.video ?? null);
	const projectReady = useSubtitleProject((state) => state.file === opened.file && state.status === 'ready');
	const fonts = useSubtitleProject((state) => state.fonts);
	const tracks = useProjectTracks();
	const current = useSubtitleProject((state) => state.current);
	const doc = useSubtitleDoc();
	const areaRef = useRef<HTMLDivElement>(null);
	const area = useBoxSize(areaRef);
	const [choice, setChoice] = useState<boolean | null>(null);
	const currentTrack = tracks.find((track) => track.key === current);
	// Edited subtitles show, and so do tracks the file marks as default, as players do.
	const shown = choice ?? Boolean(currentTrack && (currentTrack.edited || currentTrack.info?.default));
	const frame = video ?? { width: 16, height: 9 };
	const scale = area.width && area.height ? Math.min(area.width / frame.width, area.height / frame.height) : 0;
	const width = Math.floor(frame.width * scale);
	const height = Math.floor(frame.height * scale);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== ' ' || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
			event.preventDefault();
			usePlayback.getState().toggle();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			usePlayback.getState().pause();
		};
	}, []);

	return (
		<div className="flex size-full min-h-0 flex-col gap-2">
			<div ref={areaRef} className="relative min-h-0 flex-1">
				<PlayerPicture width={width} height={height}>
					{width > 0 && shown && projectReady && (
						<SubtitleLayer
							doc={doc}
							time={time}
							title={opened.file.name.replace(/\.[^.]+$/, '')}
							video={video}
							fonts={fonts}
						/>
					)}
				</PlayerPicture>
			</div>
			<PlayerControls>{projectReady && <SubtitleMenu shown={shown} onShown={setChoice} />}</PlayerControls>
		</div>
	);
}
