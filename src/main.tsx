import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { countPage } from './app/analytics';
import { startPwa } from './app/pwa';
import { getLocale } from './paraglide/runtime.js';
import { routeTree } from './routeTree.gen';
import './styles/app.css';

const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

document.documentElement.lang = getLocale();
startPwa();
// Work used to be kept across closed tabs, with copies of the files: what is left of it goes.
try {
	indexedDB.deleteDatabase('vixely-session');
} catch {
	// Storage refused (a private window): there is nothing kept either.
}

// Counted once the page has its title, which its own effects set.
router.subscribe('onResolved', ({ toLocation }) => {
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
