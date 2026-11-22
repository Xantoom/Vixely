// Applies the saved theme before the first paint, to avoid a flash of the wrong one.
try {
	const theme = localStorage.getItem('vixely:theme');
	if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {}
