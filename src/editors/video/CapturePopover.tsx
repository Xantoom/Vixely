import { Camera, Download, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { Options, Popover, useClose } from 'xantoom-design/react';
import { m } from '@/paraglide/messages.js';

/** The picture taken: as the preview shows it, or as the video has it. */
export type CaptureSource = 'shown' | 'original';
export type CaptureAction = 'download' | 'edit';

/**
 * The camera by the time: a small panel (the design system's popover) choosing which picture to take, the one shown
 * or the original, then what to do with it. The choice stays for the next time.
 */
export function CapturePopover({
	busy,
	onRun,
}: {
	/** A picture is being taken: the button waits. */
	busy: boolean;
	onRun: (source: CaptureSource, action: CaptureAction) => void;
}) {
	const [source, setSource] = useState<CaptureSource>('shown');
	return (
		<Popover
			label={m.capture_menu()}
			className="w-max max-w-[calc(100vw-16px)] min-w-60 p-0"
			trigger={(props) => (
				<button
					{...props}
					type="button"
					aria-label={m.capture_menu()}
					data-tip={props['aria-expanded'] ? undefined : m.capture_menu()}
					disabled={busy}
					// The icon sits as far from the line before it as the time does.
					className="text-fg-faint hover:bg-sunken hover:text-fg aria-expanded:bg-sunken aria-expanded:text-fg -ml-1.5 grid size-10 flex-none place-items-center rounded-md transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 max-md:ml-0"
				>
					<Camera size={17} aria-hidden="true" />
				</button>
			)}
		>
			<CapturePanel source={source} onSource={setSource} onRun={onRun} />
		</Popover>
	);
}

function CapturePanel({
	source,
	onSource,
	onRun,
}: {
	source: CaptureSource;
	onSource: (source: CaptureSource) => void;
	onRun: (source: CaptureSource, action: CaptureAction) => void;
}) {
	const close = useClose();
	const actions: { action: CaptureAction; label: string; Icon: typeof Download }[] = [
		{ action: 'download', label: m.capture_action_download(), Icon: Download },
		{ action: 'edit', label: m.capture_action_edit(), Icon: ImageIcon },
	];
	return (
		// Keys stay in the panel: Space picks here, it doesn't play the video.
		<div
			className="flex flex-col"
			onKeyDown={(event) => {
				if (event.key !== 'Escape') event.stopPropagation();
			}}
		>
			<div className="border-line border-b p-1.5">
				<Options
					name="capture-source"
					legend={m.capture_which()}
					value={source}
					options={[
						{ value: 'shown', label: m.capture_shown() },
						{ value: 'original', label: m.capture_original() },
					]}
					onChange={onSource}
					className="w-full"
				/>
			</div>
			<div className="grid gap-px p-1">
				{actions.map(({ action, label, Icon }) => (
					<button
						key={action}
						type="button"
						onClick={() => {
							close();
							onRun(source, action);
						}}
						className="text-ui hover:bg-sunken-2 focus-visible:bg-sunken-2 flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left whitespace-nowrap transition-colors duration-100 outline-none"
					>
						<Icon className="text-fg-muted size-4 flex-none" aria-hidden="true" />
						{label}
					</button>
				))}
			</div>
		</div>
	);
}
