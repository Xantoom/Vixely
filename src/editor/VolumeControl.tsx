import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { isTyping } from '@/editor/shortcuts';
import { listeningGain, useListening } from '@/media/listening';
import { m } from '@/paraglide/messages.js';
import { layerOf } from '@/ui/layer';
import { usePopover } from '@/ui/use-popover';

/** Volume moved by one notch of the wheel over the button. */
const WHEEL_STEP = 0.05;

/** Room between the bubble and the speaker, and kept from the window's edges. */
const GAP = 6;
const EDGE = 8;

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

	// Above the speaker, centred on it like a tooltip; under it only when there is no room above.
	const { open, place, media, buttonRef, popoverRef, show, close } = usePopover((button, bubble) => {
		const rect = button.getBoundingClientRect();
		const width = bubble.offsetWidth;
		const height = bubble.offsetHeight;
		const up = rect.top - GAP - height >= EDGE;
		return {
			top: up ? rect.top - GAP - height : rect.bottom + GAP,
			left: Math.max(EDGE, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - EDGE - width)),
			down: !up,
		};
	});
	const sliderRef = useRef<HTMLInputElement>(null);

	// Once placed (hidden until then, it can't take the focus), the slider has the keyboard.
	const placed = place !== null;
	useEffect(() => {
		if (placed) sliderRef.current?.focus({ preventScroll: true });
	}, [placed]);

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
		<>
			<button
				ref={buttonRef}
				type="button"
				aria-label={m.volume_title()}
				data-tip={open ? undefined : m.volume_title()}
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => {
					if (open) {
						close(false);
						return;
					}
					show();
				}}
				className="text-muted hover:bg-surface hover:text-ink aria-expanded:bg-surface aria-expanded:text-ink grid size-10 flex-none place-items-center rounded-sm transition-colors duration-150"
			>
				<Icon size={18} aria-hidden="true" />
			</button>
			{open &&
				createPortal(
					<div
						ref={popoverRef}
						role="dialog"
						aria-label={m.volume_listening()}
						data-media={media ?? undefined}
						data-down={place?.down ?? true}
						onKeyDown={(event) => {
							if (event.key === 'Escape') {
								event.preventDefault();
								event.stopPropagation();
								close(true);
							}
						}}
						className="menu-in bg-bg text-ink fixed z-50 flex items-center gap-2 rounded-md py-1.5 pr-3.5 pl-1.5 shadow-[0_0_0_1px_var(--line-2),0_18px_44px_-14px_rgb(0_0_0/0.4)]"
						style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }}
					>
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
							ref={sliderRef}
							type="range"
							aria-label={m.volume_listening()}
							min={0}
							max={100}
							step={1}
							value={percent}
							aria-valuetext={`${percent} %`}
							onChange={(event) => {
								setVolume(Number(event.target.value) / 100);
							}}
							className="volume-range w-32"
							style={{ '--level': `${percent}%` }}
						/>
						<output className="text-small tabular text-ink w-12 text-right whitespace-nowrap">
							{percent} %
						</output>
					</div>,
					layerOf(buttonRef.current),
				)}
		</>
	);
}
