/**
 * Where a floating list or tip opened from `element` goes: into the open dialog holding it, since
 * a modal dialog sits above the page and leaves everything outside it inert, or else the body.
 */
export function layerOf(element: Element | null | undefined): HTMLElement {
	return element?.closest<HTMLElement>('dialog[open]') ?? document.body;
}
