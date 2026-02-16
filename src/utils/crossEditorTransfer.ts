const IMAGE_TRANSFER_KEY = '__vixelyPendingImageTransfer';

interface PendingImageTransfer {
	file: File;
	createdAt: number;
}

export function setPendingImageTransfer(file: File) {
	(window as Window & { [IMAGE_TRANSFER_KEY]?: PendingImageTransfer })[IMAGE_TRANSFER_KEY] = {
		file,
		createdAt: Date.now(),
	};
}

export function consumePendingImageTransfer(maxAgeMs = 5 * 60 * 1000): File | null {
	const win = window as Window & { [IMAGE_TRANSFER_KEY]?: PendingImageTransfer };
	const payload = win[IMAGE_TRANSFER_KEY];
	if (!payload) return null;
	delete win[IMAGE_TRANSFER_KEY];
	if (Date.now() - payload.createdAt > maxAgeMs) return null;
	return payload.file;
}
