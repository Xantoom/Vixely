import type { ImageDoc, Size } from './document';
import { type AspectId, useImageDoc, useImageEditor } from './store';

/**
 * A picture being edited: its document and how to change it. The crop and adjustment panels work
 * on this, so the image editor and the video editor (whose frames are pictures too) share them.
 */
export interface PictureEditing {
	doc: ImageDoc;
	/** Size of the picture as it comes, before the document's rotation. */
	size: Size;
	/** Applies a change as one undo step. */
	apply: (change: (doc: ImageDoc) => ImageDoc) => void;
	/** Changes the picture during a gesture, without undo steps. */
	preview: (change: (doc: ImageDoc) => ImageDoc) => void;
	/** Ends the gesture: everything since it started becomes one undo step. */
	settle: () => void;
	aspect: AspectId;
	setAspect: (aspect: AspectId) => void;
}

/** The image editor's picture. */
export function useImagePictureEditing(size: Size): PictureEditing {
	const doc = useImageDoc();
	const apply = useImageEditor((state) => state.apply);
	const preview = useImageEditor((state) => state.preview);
	const settle = useImageEditor((state) => state.settle);
	const aspect = useImageEditor((state) => state.cropAspect);
	const setAspect = useImageEditor((state) => state.setCropAspect);
	return { doc, size, apply, preview, settle, aspect, setAspect };
}
