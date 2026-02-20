import { useCallback, useRef, useState } from 'react';

type PendingAction = () => void;

interface PendingActionConfirmation {
	isConfirmOpen: boolean;
	requestAction: (action: PendingAction) => void;
	confirmPendingAction: () => void;
	cancelPendingAction: () => void;
}

export function usePendingActionConfirmation(shouldConfirm: boolean): PendingActionConfirmation {
	const pendingActionRef = useRef<PendingAction | null>(null);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);

	const requestAction = useCallback(
		(action: PendingAction) => {
			if (!shouldConfirm) {
				action();
				return;
			}
			pendingActionRef.current = action;
			setIsConfirmOpen(true);
		},
		[shouldConfirm],
	);

	const confirmPendingAction = useCallback(() => {
		setIsConfirmOpen(false);
		const pending = pendingActionRef.current;
		pendingActionRef.current = null;
		pending?.();
	}, []);

	const cancelPendingAction = useCallback(() => {
		setIsConfirmOpen(false);
		pendingActionRef.current = null;
	}, []);

	return { isConfirmOpen, requestAction, confirmPendingAction, cancelPendingAction };
}
