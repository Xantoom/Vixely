import { create } from 'zustand';
import { useSession } from '@/media/session';

/**
 * A picture taken from the video editor as shown, with the video's subtitles: the image editor
 * keeps the picture with them drawn in beside the file without, and works on either. Turning them
 * off or on changes the picture edited and exported, the edits staying as they are.
 */
interface CapturedSubtitles {
	/** The picture as the video has it, opened in the image editor. */
	picture: File;
	/** The same picture with the subtitles shown then drawn in, where they lie on it. */
	subtitled: ImageBitmap;
	shown: boolean;
}

export const useCapturedSubtitles = create<{
	captured: CapturedSubtitles | null;
	setCaptured: (captured: CapturedSubtitles | null) => void;
	setShown: (shown: boolean) => void;
}>((set, get) => ({
	captured: null,
	setCaptured: (captured) => {
		const previous = get().captured;
		if (previous && previous.subtitled !== captured?.subtitled) previous.subtitled.close();
		set({ captured });
	},
	setShown: (shown) => {
		const { captured } = get();
		if (captured) set({ captured: { ...captured, shown } });
	},
}));

// Another picture opened in the image editor: the subtitled one is let go, freeing its pixels.
useSession.subscribe((state, previous) => {
	const file = state.opened.image?.file;
	if (file === previous.opened.image?.file) return;
	const { captured, setCaptured } = useCapturedSubtitles.getState();
	if (captured && captured.picture !== file) setCaptured(null);
});

/** The video's subtitles that can be turned on and off on `file`, if it was taken with them. */
export function useSubtitlesOf(file: File | undefined) {
	return useCapturedSubtitles((state) =>
		file !== undefined && state.captured?.picture === file ? state.captured : null,
	);
}
