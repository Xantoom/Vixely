import { describe, expect, it } from 'vitest';
import { cut, isShortened, keptRanges, outputDuration, setTrim } from '@/document/kept';
import { createVideoDoc, isPictureEdited } from './document';

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
		expect(isPictureEdited(doc.picture)).toBe(false);
		expect(isPictureEdited({ ...doc.picture, flipX: true })).toBe(true);
		expect(isPictureEdited({ ...doc.picture, crop: { x: 0, y: 0, width: 10, height: 10 } })).toBe(true);
		expect(isPictureEdited({ ...doc.picture, adjust: { ...doc.picture.adjust, contrast: 5 } })).toBe(true);
	});

	it('knows when it is shorter than the source', () => {
		const doc = createVideoDoc(10);
		expect(isShortened(doc)).toBe(false);
		expect(isShortened(setTrim(doc, { start: 1, end: 10 }))).toBe(true);
	});
});
