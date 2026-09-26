import { describe, expect, it } from 'vitest';
import { cut, isShortened, keptRanges, outputDuration, setTrim } from '@/document/kept';
import { createText } from '@/editor/overlays/model';
import { composeTurn, createVideoDoc, editTurn, pictureChange } from './document';

describe('video document', () => {
	it('removes passages without touching the pictures', () => {
		const doc = { ...createVideoDoc(60), picture: { ...createVideoDoc(60).picture, rotation: 90 as const } };
		const next = cut(doc, { start: 10, end: 20 });
		expect(keptRanges(next)).toEqual([
			{ start: 0, end: 10 },
			{ start: 20, end: 60 },
		]);
		expect(outputDuration(next)).toBe(50);
		expect(next.picture.rotation).toBe(90);
	});

	it('tells when the pictures need encoding again', () => {
		const doc = createVideoDoc(10);
		expect(pictureChange(doc.picture)).toBe('none');
		expect(pictureChange({ ...doc.picture, flipX: true })).toBe('turn');
		expect(pictureChange({ ...doc.picture, crop: { x: 0, y: 0, width: 10, height: 10 } })).toBe('drawn');
		expect(pictureChange({ ...doc.picture, adjust: { ...doc.picture.adjust, contrast: 5 } })).toBe('drawn');
	});

	it('copies turned and mirrored pictures, redraws the rest', () => {
		const { picture } = createVideoDoc(10);
		expect(pictureChange(picture)).toBe('none');
		expect(pictureChange({ ...picture, rotation: 90, flipY: true })).toBe('turn');
		expect(pictureChange({ ...picture, overlays: [createText('title', 'Hi', 0.5)] })).toBe('drawn');
	});

	it('turns mirrors into rotations and flips the way players read them', () => {
		const { picture } = createVideoDoc(10);
		expect(editTurn({ ...picture, flipY: true })).toEqual({ rotation: 180, flip: true });
		expect(editTurn({ ...picture, flipX: true, flipY: true })).toEqual({ rotation: 180, flip: false });
		expect(editTurn({ ...picture, rotation: 90, flipX: true })).toEqual({ rotation: 90, flip: true });
		const none = { rotation: 0, flip: false } as const;
		expect(composeTurn({ rotation: 90, flip: false }, { rotation: 90, flip: false })).toEqual({
			rotation: 180,
			flip: false,
		});
		expect(composeTurn({ rotation: 270, flip: false }, { rotation: 90, flip: false })).toEqual(none);
		// Mirrored, then turned a quarter: the same as turned the other way, then mirrored.
		expect(composeTurn({ rotation: 0, flip: true }, { rotation: 90, flip: false })).toEqual({
			rotation: 270,
			flip: true,
		});
		expect(composeTurn({ rotation: 90, flip: true }, { rotation: 0, flip: true })).toEqual({
			rotation: 90,
			flip: false,
		});
	});

	it('knows when it is shorter than the source', () => {
		const doc = createVideoDoc(10);
		expect(isShortened(doc)).toBe(false);
		expect(isShortened(setTrim(doc, { start: 1, end: 10 }))).toBe(true);
	});
});
