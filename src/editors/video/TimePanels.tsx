import { Group, SpeedChoices } from '@/editor/panel-parts';
import { decimal } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { Slider } from '@/ui/fields';
import { fadeOf, NO_FADE, speedOf, VIDEO_SPEEDS, videoLength } from './document';
import { useVideoDoc, useVideoEditor } from './store';

/** The video faster or slower, its sound at the same pitch: a part of the trim panel. */
export function VideoSpeed() {
	const doc = useVideoDoc();
	const apply = useVideoEditor((state) => state.apply);
	const speed = speedOf(doc);
	return (
		<Group
			title={m.tool_speed()}
			changed={speed !== 1}
			onReset={() => {
				apply((current) => ({ ...current, speed: 1 }));
			}}
		>
			<SpeedChoices
				speeds={VIDEO_SPEEDS}
				value={speed}
				onChange={(choice) => {
					apply((current) => ({ ...current, speed: choice }));
				}}
			/>
		</Group>
	);
}

/** The picture fading from and to black, the sound from and to silence. */
export function VideoFades() {
	const doc = useVideoDoc();
	const apply = useVideoEditor((state) => state.apply);
	const preview = useVideoEditor((state) => state.preview);
	const settle = useVideoEditor((state) => state.settle);
	const fade = fadeOf(doc);
	// Tenths of a second, at most half the video each, and 10 s.
	const most = Math.max(1, Math.min(100, Math.floor((videoLength(doc) / 2) * 10)));
	const slider = (edge: 'in' | 'out', label: string) => (
		<Slider
			label={label}
			value={Math.min(most, Math.round(fade[edge] * 10))}
			min={0}
			max={most}
			format={(tenths) => `${decimal(tenths / 10, 1)} s`}
			onChange={(tenths) => {
				preview((current) => ({ ...current, fade: { ...fadeOf(current), [edge]: tenths / 10 } }));
			}}
			onEnd={settle}
		/>
	);
	return (
		<Group
			title={m.fade_title()}
			changed={fade.in > 0 || fade.out > 0}
			onReset={() => {
				apply((current) => ({ ...current, fade: NO_FADE }));
			}}
		>
			{slider('in', m.fade_in())}
			{slider('out', m.fade_out())}
		</Group>
	);
}
