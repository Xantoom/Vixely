import { useCallback, useRef, useState, type DragEventHandler } from 'react';

interface UseSingleFileDropOptions {
	onFile: (file: File) => void;
	acceptFile?: (file: File) => boolean;
	onRejectedFile?: (file: File) => void;
}

export interface SingleFileDropHandlers<T extends HTMLElement = HTMLElement> {
	onDragEnter: DragEventHandler<T>;
	onDragLeave: DragEventHandler<T>;
	onDragOver: DragEventHandler<T>;
	onDrop: DragEventHandler<T>;
}

interface UseSingleFileDropResult<T extends HTMLElement = HTMLElement> {
	isDragging: boolean;
	dropHandlers: SingleFileDropHandlers<T>;
}

export function useSingleFileDrop<T extends HTMLElement = HTMLElement>({
	onFile,
	acceptFile,
	onRejectedFile,
}: UseSingleFileDropOptions): UseSingleFileDropResult<T> {
	const [isDragging, setIsDragging] = useState(false);
	const dragCounterRef = useRef(0);

	const onDragEnter = useCallback<DragEventHandler<T>>((event) => {
		event.preventDefault();
		event.stopPropagation();
		dragCounterRef.current += 1;
		if (dragCounterRef.current === 1) setIsDragging(true);
	}, []);

	const onDragLeave = useCallback<DragEventHandler<T>>((event) => {
		event.preventDefault();
		event.stopPropagation();
		dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
		if (dragCounterRef.current === 0) setIsDragging(false);
	}, []);

	const onDragOver = useCallback<DragEventHandler<T>>((event) => {
		event.preventDefault();
		event.stopPropagation();
	}, []);

	const onDrop = useCallback<DragEventHandler<T>>(
		(event) => {
			event.preventDefault();
			event.stopPropagation();
			dragCounterRef.current = 0;
			setIsDragging(false);

			const file = event.dataTransfer.files[0];
			if (!file) return;

			if (acceptFile && !acceptFile(file)) {
				onRejectedFile?.(file);
				return;
			}

			onFile(file);
		},
		[acceptFile, onFile, onRejectedFile],
	);

	return { isDragging, dropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop } };
}
