import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { countPage } from './app/analytics';
import { ErrorScreen } from './app/ErrorScreen';
import { startPwa, warmApp } from './app/pwa';
import { isMediaKind } from './editors/registry';
import { clearLeftovers } from './media/save-target';
import { getLocale } from './paraglide/runtime.js';
import { routeTree } from './routeTree.gen';
import './styles/app.css';

const router = createRouter({
	routeTree,
	defaultErrorComponent: ErrorScreen,
	defaultPreload: 'intent',
	scrollRestoration: true,
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

document.documentElement.lang = getLocale();
startPwa();
void clearLeftovers();
// Work used to be kept across closed tabs, with copies of the files: what is left of it goes.
try {
	indexedDB.deleteDatabase('vixely-session');
} catch {
	// Storage refused (a private window): there is nothing kept either.
}

// Counted once the page has its title, which its own effects set.
router.subscribe('onResolved', ({ toLocation }) => {
	const section = toLocation.pathname.split('/')[1] ?? '';
	if (section === 'tools' || isMediaKind(section)) warmApp();
	setTimeout(() => {
		countPage(toLocation.pathname);
	}, 300);
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
