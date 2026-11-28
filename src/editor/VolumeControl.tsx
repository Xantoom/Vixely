import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Popover } from 'xantoom-design/react';
import { isTyping } from '@/editor/shortcuts';
import { formatPercent } from '@/lib/format';
import { listeningGain, useListening } from '@/media/listening';
import { m } from '@/paraglide/messages.js';

/** Volume moved by one notch of the wheel over the button. */
const WHEEL_STEP = 0.05;

/**
 * How loud the editors play, as in video players: a speaker in the player's bar opens a bubble
 * with the level and the mute. Only for listening: exports keep the volume set in the editor. The
 * level and the mute are kept between visits.
 */
export function VolumeControl() {
	const volume = useListening((state) => state.volume);
	const muted = useListening((state) => state.muted);
	const setVolume = useListening((state) => state.setVolume);
	const toggleMute = useListening((state) => state.toggleMute);
	const silent = listeningGain({ volume, muted }) === 0;
	const Icon = silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
	const shown = muted ? 0 : volume;
	const percent = Math.round(shown * 100);

	const buttonRef = useRef<HTMLButtonElement>(null);

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

	// The wheel over the speaker turns the sound up or down, without opening anything.
	useEffect(() => {
		const button = buttonRef.current;
		if (!button) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const state = useListening.getState();
			const current = state.muted ? 0 : state.volume;
			state.setVolume(Math.round((current - Math.sign(event.deltaY) * WHEEL_STEP) * 100) / 100);
		};
		button.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			button.removeEventListener('wheel', onWheel);
		};
	}, []);

	return (
		<Popover
			label={m.volume_listening()}
			// Above the speaker, centred on it like a tooltip.
			className="[position-area:top] [position-try-fallbacks:flip-block] py-1.5 pr-3.5 pl-1.5"
			trigger={(props) => (
				<button
					{...props}
					ref={buttonRef}
					type="button"
					aria-label={m.volume_title()}
					data-tip={props['aria-expanded'] ? undefined : m.volume_title()}
					className="text-fg-faint hover:bg-sunken hover:text-fg aria-expanded:bg-sunken aria-expanded:text-fg grid size-10 flex-none place-items-center rounded-md transition-colors duration-150"
				>
					<Icon size={18} aria-hidden="true" />
				</button>
			)}
		>
			<div className="flex items-center gap-2">
				<button
					type="button"
					aria-label={silent ? m.volume_unmute() : m.volume_mute()}
					data-tip={silent ? m.volume_unmute() : m.volume_mute()}
					onClick={toggleMute}
					className="text-fg-muted hover:bg-sunken hover:text-fg grid size-9 flex-none place-items-center rounded-md transition-colors"
				>
					<Icon className="size-[1.15rem]" aria-hidden="true" />
				</button>
				<input
					// Opened, the slider has the keyboard.
					autoFocus
					type="range"
					aria-label={m.volume_listening()}
					min={0}
					max={100}
					step={1}
					value={percent}
					aria-valuetext={formatPercent(percent)}
					onChange={(event) => {
						setVolume(Number(event.target.value) / 100);
					}}
					className="volume-range w-32"
					style={{ '--level': `${percent}%` }}
				/>
				<output className="text-small x-tabular text-fg w-12 text-right whitespace-nowrap">{percent} %</output>
			</div>
		</Popover>
	);
}
