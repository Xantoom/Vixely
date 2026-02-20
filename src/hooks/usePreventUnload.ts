import { useEffect } from 'react';

export function usePreventUnload(shouldPrevent: boolean): void {
	useEffect(() => {
		if (!shouldPrevent) return;
		const handler = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', handler);
		return () => {
			window.removeEventListener('beforeunload', handler);
		};
	}, [shouldPrevent]);
}
