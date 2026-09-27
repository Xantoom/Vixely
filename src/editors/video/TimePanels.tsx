import { PanelTitle } from '@/editor/EditorLayout';
import { Group, ResetButton } from '@/editor/panel-parts';
import { decimal, formatPreciseTime } from '@/lib/format';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { Slider } from '@/ui/fields';
import { fadeOf, NO_FADE, speedOf, VIDEO_SPEEDS, videoLength } from './document';
import { useVideoDoc, useVideoEditor } from './store';

function formatSpeed(speed: number): string {
	return `${new Intl.NumberFormat(getLocale()).format(speed)}×`;
}

/** The video faster or slower, its sound at the same pitch. */
export function VideoSpeedPanel() {
	const doc = useVideoDoc();
	const apply = useVideoEditor((state) => state.apply);
	const preview = useVideoEditor((state) => state.preview);
	const settle = useVideoEditor((state) => state.settle);
	const speed = speedOf(doc);
	const index = Math.max(0, VIDEO_SPEEDS.indexOf(speed));
	return (
		<>
			<PanelTitle
				action={
					<ResetButton
						disabled={speed === 1}
						onClick={() => {
							apply((current) => ({ ...current, speed: 1 }));
						}}
					/>
				}
			>
				{m.tool_speed()}
			</PanelTitle>
			<Slider
				label={m.speed_label()}
				value={index}
				min={0}
				max={VIDEO_SPEEDS.length - 1}
				defaultValue={VIDEO_SPEEDS.indexOf(1)}
				format={(at) => formatSpeed(VIDEO_SPEEDS[at] ?? 1)}
				parse={(text) => {
					// The listed speed nearest the one typed.
					const typed = Number.parseFloat(text.replace(',', '.'));
					if (!Number.isFinite(typed)) return null;
					const distances = VIDEO_SPEEDS.map((listed) => Math.abs(listed - typed));
					return distances.indexOf(Math.min(...distances));
				}}
				onChange={(at) => {
					preview((current) => ({ ...current, speed: VIDEO_SPEEDS[at] ?? 1 }));
				}}
				onEnd={settle}
			/>
			<div role="radiogroup" aria-label={m.speed_label()} className="grid grid-cols-5 gap-1.5">
				{[0.5, 1, 1.5, 2, 4].map((choice) => (
					<button
						key={choice}
						type="button"
						role="radio"
						aria-checked={speed === choice}
						onClick={() => {
							apply((current) => ({ ...current, speed: choice }));
						}}
						className="text-ui tabular text-ink-2 hover:bg-surface aria-checked:bg-ed-soft aria-checked:text-ink h-9 rounded-sm font-medium shadow-[inset_0_0_0_1px_var(--line-2)] transition-[background-color,box-shadow] aria-checked:shadow-[inset_0_0_0_1.5px_var(--ed)]"
					>
						{formatSpeed(choice)}
					</button>
				))}
			</div>
			<p className="text-ui text-ink-2 flex justify-between">
				<span>{m.video_final_length()}</span>
				<span className="tabular text-ink font-mono text-[13px]">{formatPreciseTime(videoLength(doc))}</span>
			</p>
		</>
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
