/// <reference types="vite/client" />

interface Window {
	gtag: ((...args: unknown[]) => void) | undefined;
	dataLayer: unknown[];
}
