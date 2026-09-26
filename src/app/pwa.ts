import { create } from 'zustand';

/**
 * The installed app and its service worker (src/service-worker.ts): offline use, updates, and the
 * browser's own install prompt. Only the built site has a service worker; the dev server doesn't.
 */

interface InstallPrompt extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
	interface WindowEventMap {
		beforeinstallprompt: InstallPrompt;
	}
	interface Navigator {
		connection?: { saveData?: boolean; effectiveType?: string };
	}
}

interface PwaState {
	/** A new version is ready: it takes over when the page reloads through `update`. */
	updateReady: boolean;
	/** The browser offers to install the site as an app. */
	installable: boolean;
}

export const usePwa = create<PwaState>(() => ({ updateReady: false, installable: false }));

let registration: ServiceWorkerRegistration | null = null;
let installPrompt: InstallPrompt | null = null;

/** Whether the connection is one to spare: no data saver, not 2G. */
function generousConnection(): boolean {
	const connection = navigator.connection;
	return !connection?.saveData && !/2g/.test(connection?.effectiveType ?? '');
}

/** Caches the rest of the app in the background, once the page is idle, so it all works offline. */
function warm(worker: ServiceWorker | null) {
	if (!worker || !generousConnection()) return;
	const ask = () => {
		worker.postMessage({ type: 'warm' });
	};
	if ('requestIdleCallback' in window) requestIdleCallback(ask, { timeout: 10_000 });
	else setTimeout(ask, 3000);
}

function watch(found: ServiceWorkerRegistration) {
	registration = found;
	if (found.waiting && navigator.serviceWorker.controller) usePwa.setState({ updateReady: true });
	found.addEventListener('updatefound', () => {
		const installing = found.installing;
		installing?.addEventListener('statechange', () => {
			if (installing.state !== 'installed') return;
			// The first worker of a visit is no update: it simply starts.
			if (navigator.serviceWorker.controller) usePwa.setState({ updateReady: true });
		});
	});
}

export function startPwa() {
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		installPrompt = event;
		usePwa.setState({ installable: true });
	});
	window.addEventListener('appinstalled', () => {
		installPrompt = null;
		usePwa.setState({ installable: false });
	});

	if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
	window.addEventListener('load', () => {
		navigator.serviceWorker
			.register('/sw.js')
			.then(async (found) => {
				watch(found);
				warm((await navigator.serviceWorker.ready).active);
			})
			.catch(() => {
				// Without it the site still works, online.
			});
	});
	// Long sessions look for a new version now and then.
	setInterval(
		() => {
			if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
		},
		60 * 60 * 1000,
	);
}

/** Moves to the new version: the page reloads once the new worker has taken over. */
export function applyUpdate() {
	const waiting = registration?.waiting;
	if (!waiting) {
		location.reload();
		return;
	}
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		location.reload();
	});
	waiting.postMessage({ type: 'update' });
}

/** Shows the browser's install question. */
export async function install() {
	if (!installPrompt) return;
	await installPrompt.prompt();
	const { outcome } = await installPrompt.userChoice;
	if (outcome === 'accepted') {
		installPrompt = null;
		usePwa.setState({ installable: false });
	}
}

/** Files shared with the installed app, taken from the service worker. */
export async function takeSharedFiles(): Promise<File[]> {
	const worker = (await navigator.serviceWorker?.ready)?.active;
	if (!worker) return [];
	return new Promise((resolve) => {
		const onMessage = (event: MessageEvent<{ type?: string; files?: File[] }>) => {
			if (event.data?.type !== 'shared') return;
			navigator.serviceWorker.removeEventListener('message', onMessage);
			resolve(event.data.files ?? []);
		};
		navigator.serviceWorker.addEventListener('message', onMessage);
		navigator.serviceWorker.startMessages();
		worker.postMessage({ type: 'take-shared' });
	});
}
