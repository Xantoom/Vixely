import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect } from 'react';
import { isTyping } from '@/editor/shortcuts';
import { listeningGain, useListening } from '@/media/listening';
import { m } from '@/paraglide/messages.js';

/**
 * How loud the editors play, as in video players: the speaker mutes, the bar beside it sets the
 * level. Only for listening: exports keep the volume set in the editor. Phones use their own
 * buttons, so they get the speaker alone.
 */
export function VolumeControl() {
	const volume = useListening((state) => state.volume);
	const muted = useListening((state) => state.muted);
	const setVolume = useListening((state) => state.setVolume);
	const toggleMute = useListening((state) => state.toggleMute);
	const silent = listeningGain({ volume, muted }) === 0;
	const Icon = silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
	const shown = muted ? 0 : volume;
	// M mutes and brings the sound back, as in video players.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'm' && event.key !== 'M') return;
			if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
			event.preventDefault();
			useListening.getState().toggleMute();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, []);
	return (
		<div className="group/volume flex flex-none items-center">
			<button
				type="button"
				aria-label={silent ? m.volume_unmute() : m.volume_mute()}
				data-tip={silent ? m.volume_unmute() : m.volume_mute()}
				onClick={toggleMute}
				className="text-ink-2 hover:bg-surface hover:text-ink grid size-9 flex-none place-items-center rounded-sm transition-colors"
			>
				<Icon className="size-[1.15rem]" aria-hidden="true" />
			</button>
			<input
				type="range"
				aria-label={m.volume_listening()}
				min={0}
				max={100}
				step={1}
				value={Math.round(shown * 100)}
				aria-valuetext={`${Math.round(shown * 100)} %`}
				onChange={(event) => {
					setVolume(Number(event.target.value) / 100);
				}}
				className="volume-range w-16 max-md:hidden lg:w-20"
				style={{ '--level': `${shown * 100}%` }}
			/>
		</div>
	);
}
