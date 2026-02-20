import { useCallback, useEffect, useRef, useState } from 'react';

type ObjectUrl = string | null;

type SetObjectUrl = (nextUrl: ObjectUrl) => void;

export function useObjectUrlState(initialUrl: ObjectUrl = null): [ObjectUrl, SetObjectUrl] {
	const [url, setUrlState] = useState<ObjectUrl>(initialUrl);
	const currentUrlRef = useRef<ObjectUrl>(initialUrl);

	const setUrl = useCallback((nextUrl: ObjectUrl) => {
		const previousUrl = currentUrlRef.current;
		if (previousUrl && previousUrl !== nextUrl) {
			URL.revokeObjectURL(previousUrl);
		}
		currentUrlRef.current = nextUrl;
		setUrlState(nextUrl);
	}, []);

	useEffect(() => {
		return () => {
			const currentUrl = currentUrlRef.current;
			if (currentUrl) {
				URL.revokeObjectURL(currentUrl);
			}
		};
	}, []);

	return [url, setUrl];
}
