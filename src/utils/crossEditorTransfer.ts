const IMAGE_TRANSFER_KEY = '__vixelyPendingImageTransfer';
const GIF_TRANSFER_KEY = '__vixelyPendingGifTransfer';

interface PendingFileTransfer {
	file: File;
	createdAt: number;
}

export function setPendingImageTransfer(file: File) {
	(window as Window & { [IMAGE_TRANSFER_KEY]?: PendingFileTransfer })[IMAGE_TRANSFER_KEY] = {
		file,
		createdAt: Date.now(),
	};
}

export function consumePendingImageTransfer(maxAgeMs = 5 * 60 * 1000): File | null {
	const win = window as Window & { [IMAGE_TRANSFER_KEY]?: PendingFileTransfer };
	const payload = win[IMAGE_TRANSFER_KEY];
	if (!payload) return null;
	delete win[IMAGE_TRANSFER_KEY];
	if (Date.now() - payload.createdAt > maxAgeMs) return null;
	return payload.file;
}

export function setPendingGifTransfer(file: File) {
	(window as Window & { [GIF_TRANSFER_KEY]?: PendingFileTransfer })[GIF_TRANSFER_KEY] = {
		file,
		createdAt: Date.now(),
	};
}

export function consumePendingGifTransfer(maxAgeMs = 5 * 60 * 1000): File | null {
	const win = window as Window & { [GIF_TRANSFER_KEY]?: PendingFileTransfer };
	const payload = win[GIF_TRANSFER_KEY];
	if (!payload) return null;
	delete win[GIF_TRANSFER_KEY];
	if (Date.now() - payload.createdAt > maxAgeMs) return null;
	return payload.file;
}
