/** Joins class names, dropping falsy entries. No dependency for this. */
export function cn(...values: (string | false | null | undefined)[]): string {
	return values.filter(Boolean).join(" ");
}
