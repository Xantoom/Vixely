/**
 * While the editor's columns slide (a panel opening or closing), what measures its own box waits:
 * the browser lays the page out on every frame, and nothing is drawn again in JavaScript until the
 * columns have settled. Sizes are then taken once.
 */
let moving = false;
let timer = 0;
const settled = new Set<() => void>();

export function isLayoutMoving(): boolean {
	return moving;
}

/** The layout moves for the next `duration` milliseconds. */
export function holdLayout(duration: number): void {
	moving = true;
	window.clearTimeout(timer);
	timer = window.setTimeout(() => {
		moving = false;
		for (const listener of settled) listener();
	}, duration);
}

/** Called once the layout stops moving. */
export function onLayoutSettled(listener: () => void): () => void {
	settled.add(listener);
	return () => {
		settled.delete(listener);
	};
}
