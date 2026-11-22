import { Camera, Download, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { m } from '@/paraglide/messages.js';
import { layerOf } from '@/ui/layer';
import { placeList } from '@/ui/place';
import { Segmented } from '@/ui/Segmented';
import { usePopover } from '@/ui/use-popover';

/** The picture taken: as the preview shows it, or as the video has it. */
export type CaptureSource = 'shown' | 'original';
export type CaptureAction = 'download' | 'edit';

/**
 * The camera by the time: a small panel choosing which picture to take, the one shown or the
 * original, then what to do with it. The choice stays for the next time.
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
	const { open, place, media, buttonRef, popoverRef, show, close } = usePopover((button, panel) =>
		placeList(button.getBoundingClientRect(), { width: panel.offsetWidth, height: panel.offsetHeight }, 'start'),
	);

	// Once placed (hidden until then, it can't take the focus), the chosen picture has the keyboard.
	const placed = place !== null;
	useEffect(() => {
		if (placed)
			popoverRef.current?.querySelector<HTMLElement>('[aria-checked=true]')?.focus({ preventScroll: true });
	}, [placed]);

	const actions: { action: CaptureAction; label: string; Icon: typeof Download }[] = [
		{ action: 'download', label: m.capture_action_download(), Icon: Download },
		{ action: 'edit', label: m.capture_action_edit(), Icon: ImageIcon },
	];

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				aria-label={m.capture_menu()}
				data-tip={open ? undefined : m.capture_menu()}
				aria-haspopup="dialog"
				aria-expanded={open}
				disabled={busy}
				onClick={() => {
					if (open) {
						close(false);
						return;
					}
					show();
				}}
				// The icon sits as far from the line before it as the time does.
				className="text-muted hover:bg-surface hover:text-ink aria-expanded:bg-surface aria-expanded:text-ink -ml-1.5 grid size-10 flex-none place-items-center rounded-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 max-md:ml-0"
			>
				<Camera size={17} aria-hidden="true" />
			</button>
			{open &&
				createPortal(
					<div
						ref={popoverRef}
						role="dialog"
						aria-label={m.capture_menu()}
						data-media={media ?? undefined}
						data-down={place?.down ?? true}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === 'Escape') {
								event.preventDefault();
								close(true);
							}
						}}
						className="menu-in bg-bg text-ink fixed z-50 flex w-max max-w-[calc(100vw-16px)] min-w-60 flex-col rounded-md shadow-[0_0_0_1px_var(--line-2),0_18px_44px_-14px_rgb(0_0_0/0.4)]"
						style={place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: 'hidden' }}
					>
						<div className="border-line border-b p-1.5">
							<Segmented
								label={m.capture_which()}
								value={source}
								options={[
									{ value: 'shown', label: m.capture_shown() },
									{ value: 'original', label: m.capture_original() },
								]}
								onChange={setSource}
							/>
						</div>
						<div className="grid gap-px p-1">
							{actions.map(({ action, label, Icon }) => (
								<button
									key={action}
									type="button"
									onClick={() => {
										close(true);
										onRun(source, action);
									}}
									className="text-ui hover:bg-surface-2 focus-visible:bg-surface-2 flex min-h-9 items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left whitespace-nowrap transition-colors duration-100 outline-none"
								>
									<Icon className="text-ink-2 size-4 flex-none" aria-hidden="true" />
									{label}
								</button>
							))}
						</div>
					</div>,
					layerOf(buttonRef.current),
				)}
		</>
	);
}
